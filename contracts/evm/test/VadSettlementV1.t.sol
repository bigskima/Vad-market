// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../src/VadSettlementV1.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
    function warp(uint256 timestamp) external;
}

contract MockUsdc is IERC20 {
    string public constant name = "Mock USDC";
    string public constant symbol = "mUSDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ALLOWANCE");
        allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract VadSettlementV1Test {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant QUOTE_SIGNER_KEY = 0xA11CE;
    uint256 private constant SETTLEMENT_SIGNER_KEY = 0xB0B;
    uint256 private constant USER_KEY = 0xCAFE;

    MockUsdc private usdc;
    VadSettlementV1 private settlement;
    address private quoteSigner;
    address private settlementSigner;
    address private user;
    address private treasury = address(0xFEE);
    address private resolver = address(0xBEEF);

    bytes32 private constant MARKET = keccak256("vad-market-1");
    bytes32 private constant YES = keccak256("YES");
    bytes32 private constant NO = keccak256("NO");
    bytes32 private constant POSITION = keccak256("position-1");

    function setUp() public {
        quoteSigner = vm.addr(QUOTE_SIGNER_KEY);
        settlementSigner = vm.addr(SETTLEMENT_SIGNER_KEY);
        user = vm.addr(USER_KEY);

        usdc = new MockUsdc();
        settlement = new VadSettlementV1(
            address(usdc),
            address(this),
            quoteSigner,
            settlementSigner,
            resolver,
            treasury
        );

        usdc.mint(user, 1_000_000_000);

        vm.prank(user);
        usdc.approve(address(settlement), type(uint256).max);
    }

    function testLockCollectsSignedTradingFeeAndEscrowsOnlyCollateral() public {
        VadSettlementV1.LockAuthorization memory auth = _lockAuthorization(
            POSITION,
            100_000_000,
            2_000_000,
            41
        );

        bytes memory signature = _signLock(auth);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(user);
        settlement.lockPosition(auth, signature);

        _assertEq(usdc.balanceOf(treasury) - treasuryBefore, 2_000_000, "trading fee");
        _assertEq(settlement.marketEscrow(MARKET), 100_000_000, "market escrow");

        (
            address positionUser,
            bytes32 marketId,
            bytes32 outcomeId,
            uint256 collateral,
            uint256 tradingFee,
            uint256 policyVersion,
            VadSettlementV1.PositionStatus status
        ) = settlement.positions(POSITION);

        _assertEq(positionUser, user, "user");
        _assertEq(marketId, MARKET, "market");
        _assertEq(outcomeId, YES, "outcome");
        _assertEq(collateral, 100_000_000, "collateral");
        _assertEq(tradingFee, 2_000_000, "stored fee");
        _assertEq(policyVersion, 41, "policy version");
        _assertEq(uint256(status), uint256(VadSettlementV1.PositionStatus.LOCKED), "status");
    }

    function testFeeCannotBeChangedAfterVadSignsQuote() public {
        VadSettlementV1.LockAuthorization memory signedAuth = _lockAuthorization(
            POSITION,
            100_000_000,
            2_000_000,
            41
        );
        bytes memory signature = _signLock(signedAuth);

        VadSettlementV1.LockAuthorization memory tampered = signedAuth;
        tampered.tradingFeeAmount = 0;

        vm.expectRevert(VadSettlementV1.InvalidAuthorizationSignature.selector);
        vm.prank(user);
        settlement.lockPosition(tampered, signature);
    }

    function testWinningSettlementCollectsAdminQuotedSettlementFee() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION,
            100_000_000,
            2_000_000,
            41
        );
        bytes memory lockSignature = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSignature);

        address otherUser = vm.addr(0xD00D);
        VadSettlementV1.LockAuthorization memory other = _lockAuthorization(
            keccak256("position-2"),
            100_000_000,
            0,
            0
        );
        other.user = otherUser;
        usdc.mint(otherUser, 100_000_000);
        vm.prank(otherUser);
        usdc.approve(address(settlement), type(uint256).max);
        bytes32 otherDigest = settlement.lockAuthorizationDigest(other);
        (uint8 ov, bytes32 or_, bytes32 os) = vm.sign(QUOTE_SIGNER_KEY, otherDigest);
        vm.prank(otherUser);
        settlement.lockPosition(other, abi.encodePacked(or_, os, ov));

        bytes32 evidence = keccak256("oracle-evidence");
        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, evidence);

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("settle-1"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 190_000_000,
                settlementFeeAmount: 3_800_000,
                settlementFeePolicyVersion: 52,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        uint256 userBefore = usdc.balanceOf(user);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        bytes memory settlementSignature = _signSettlement(settleAuth);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settlementSignature);

        _assertEq(usdc.balanceOf(user) - userBefore, 186_200_000, "net payout");
        _assertEq(usdc.balanceOf(treasury) - treasuryBefore, 3_800_000, "settlement fee");
        _assertEq(settlement.marketEscrow(MARKET), 10_000_000, "remaining escrow");
    }

    function testVoidedMarketRefundsCollateralWithoutSettlementFee() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION,
            75_000_000,
            1_500_000,
            41
        );
        bytes memory lockSignature = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSignature);

        bytes32 evidence = keccak256("void-evidence");
        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, bytes32(0), true, evidence);

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("refund-1"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 75_000_000,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        uint256 userBefore = usdc.balanceOf(user);

        bytes memory settlementSignature = _signSettlement(settleAuth);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settlementSignature);

        _assertEq(usdc.balanceOf(user) - userBefore, 75_000_000, "refund");
        _assertEq(settlement.marketEscrow(MARKET), 0, "void escrow");
    }

    function testLoserCannotClaimPositivePayout() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION,
            100_000_000,
            0,
            0
        );
        lockAuth.outcomeId = NO;
        bytes memory lockSignature = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSignature);

        bytes32 evidence = keccak256("oracle-evidence");
        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, evidence);

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("bad-settlement"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 1,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        bytes memory settlementSignature = _signSettlement(settleAuth);
        vm.expectRevert(VadSettlementV1.InvalidAmount.selector);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settlementSignature);
    }

    function testExpiredLockAuthorizationRejected() public {
        vm.warp(1_000);
        VadSettlementV1.LockAuthorization memory auth = _lockAuthorization(
            POSITION,
            100_000_000,
            0,
            0
        );
        auth.deadline = 999;

        bytes memory signature = _signLock(auth);
        vm.expectRevert(VadSettlementV1.AuthorizationExpired.selector);
        vm.prank(user);
        settlement.lockPosition(auth, signature);
    }

    function testLockAuthorizationCannotBeReplayed() public {
        VadSettlementV1.LockAuthorization memory auth = _lockAuthorization(
            POSITION,
            100_000_000,
            0,
            0
        );
        bytes memory signature = _signLock(auth);

        vm.prank(user);
        settlement.lockPosition(auth, signature);

        vm.expectRevert(VadSettlementV1.AuthorizationAlreadyUsed.selector);
        vm.prank(user);
        settlement.lockPosition(auth, signature);
    }

    function testPositiveTradingFeeRequiresPolicyVersion() public {
        VadSettlementV1.LockAuthorization memory auth = _lockAuthorization(
            POSITION,
            100_000_000,
            1_000_000,
            0
        );

        bytes memory signature = _signLock(auth);
        vm.expectRevert(VadSettlementV1.InvalidState.selector);
        vm.prank(user);
        settlement.lockPosition(auth, signature);
    }

    function testOnlyResolverCanResolveMarket() public {
        vm.expectRevert(VadSettlementV1.Unauthorized.selector);
        vm.prank(address(0xBAD));
        settlement.resolveMarket(MARKET, YES, false, keccak256("evidence"));
    }

    function testMarketCannotBeResolvedTwice() public {
        vm.prank(resolver);
        settlement.resolveMarket(MARKET, YES, false, keccak256("first-evidence"));

        vm.expectRevert(VadSettlementV1.InvalidState.selector);
        vm.prank(resolver);
        settlement.resolveMarket(MARKET, YES, false, keccak256("second-evidence"));
    }

    function testPauseBlocksNewLocksButNotExistingSettlement() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION,
            100_000_000,
            0,
            0
        );
        bytes memory lockSignature = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSignature);

        settlement.setNewLocksPaused(true);
        VadSettlementV1.LockAuthorization memory blockedAuth = _lockAuthorization(
            keccak256("paused-position"),
            50_000_000,
            0,
            0
        );
        bytes memory blockedSignature = _signLock(blockedAuth);
        vm.expectRevert(VadSettlementV1.NewLocksPaused.selector);
        vm.prank(user);
        settlement.lockPosition(blockedAuth, blockedSignature);

        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, keccak256("pause-test-evidence"));
        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("pause-settlement"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 100_000_000,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        bytes memory settlementSignature = _signSettlement(settleAuth);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settlementSignature);

        (, , , , , , VadSettlementV1.PositionStatus status) = settlement.positions(POSITION);
        _assertEq(uint256(status), uint256(VadSettlementV1.PositionStatus.SETTLED), "existing position settles while paused");
    }

    function testSettlementFeeCannotExceedGrossPayout() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION,
            100_000_000,
            0,
            0
        );
        bytes memory lockSignature = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSignature);

        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, keccak256("fee-bound-evidence"));
        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("fee-over-gross"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 50_000_000,
                settlementFeeAmount: 50_000_001,
                settlementFeePolicyVersion: 52,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        bytes memory settlementSignature = _signSettlement(settleAuth);
        vm.expectRevert(VadSettlementV1.InvalidAmount.selector);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settlementSignature);
    }

    function testSettlementTokenCannotBeRecovered() public {
        vm.expectRevert(VadSettlementV1.SettlementTokenRecoveryForbidden.selector);
        settlement.recoverNonSettlementToken(address(usdc), address(this), 1);
    }

    function testUnrelatedTokenCanBeRecovered() public {
        MockUsdc unrelated = new MockUsdc();
        unrelated.mint(address(settlement), 25);
        settlement.recoverNonSettlementToken(address(unrelated), address(this), 25);
        _assertEq(unrelated.balanceOf(address(this)), 25, "unrelated token recovered");
    }

    function _lockAuthorization(
        bytes32 positionId,
        uint256 collateral,
        uint256 fee,
        uint256 policyVersion
    ) private view returns (VadSettlementV1.LockAuthorization memory) {
        return VadSettlementV1.LockAuthorization({
            authorizationId: keccak256(abi.encode("lock", positionId, collateral, fee)),
            positionId: positionId,
            marketId: MARKET,
            outcomeId: YES,
            user: user,
            collateralAmount: collateral,
            tradingFeeAmount: fee,
            tradingFeePolicyVersion: policyVersion,
            deadline: block.timestamp + 1 hours
        });
    }

    function _signLock(
        VadSettlementV1.LockAuthorization memory auth
    ) private returns (bytes memory) {
        bytes32 digest = settlement.lockAuthorizationDigest(auth);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(QUOTE_SIGNER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signSettlement(
        VadSettlementV1.SettlementAuthorization memory auth
    ) private returns (bytes memory) {
        bytes32 digest = settlement.settlementAuthorizationDigest(auth);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SETTLEMENT_SIGNER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }

    function _assertEq(address actual, address expected, string memory reason) private pure {
        require(actual == expected, reason);
    }

    function _assertEq(bytes32 actual, bytes32 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }

    // -------------------------------------------------------------------------
    // Security: wrong signer
    // -------------------------------------------------------------------------

    function testWrongLockSignerRejected() public {
        VadSettlementV1.LockAuthorization memory auth = _lockAuthorization(
            POSITION, 100_000_000, 0, 0
        );
        bytes32 digest = settlement.lockAuthorizationDigest(auth);
        // Sign with settlement signer key instead of quote signer key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SETTLEMENT_SIGNER_KEY, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert(VadSettlementV1.InvalidAuthorizationSignature.selector);
        vm.prank(user);
        settlement.lockPosition(auth, badSig);
    }

    function testWrongSettlementSignerRejected() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION, 100_000_000, 0, 0
        );
        bytes memory lockSig = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSig);

        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, keccak256("ev"));

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("wrong-signer-settle"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 100_000_000,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        // Sign with quote signer key instead of settlement signer key
        bytes32 digest = settlement.settlementAuthorizationDigest(settleAuth);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(QUOTE_SIGNER_KEY, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert(VadSettlementV1.InvalidAuthorizationSignature.selector);
        vm.prank(user);
        settlement.settlePosition(settleAuth, badSig);
    }

    // -------------------------------------------------------------------------
    // Security: wrong resolution hash
    // -------------------------------------------------------------------------

    function testWrongResolutionHashRejected() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION, 100_000_000, 0, 0
        );
        bytes memory lockSig = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSig);

        vm.prank(resolver);
        settlement.resolveMarket(MARKET, YES, false, keccak256("real-evidence"));

        bytes32 fakeHash = keccak256("this-is-not-the-real-resolution-hash");

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("wrong-hash-settle"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 100_000_000,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: fakeHash,
                deadline: block.timestamp + 1 hours
            });

        bytes memory settleSig = _signSettlement(settleAuth);
        vm.expectRevert(VadSettlementV1.InvalidResolution.selector);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settleSig);
    }

    // -------------------------------------------------------------------------
    // Security: settlement authorization replay
    // -------------------------------------------------------------------------

    function testSettlementAuthorizationCannotBeReplayed() public {
        // Lock two separate positions so there is enough escrow for both attempts
        VadSettlementV1.LockAuthorization memory lockAuth1 = _lockAuthorization(
            POSITION, 100_000_000, 0, 0
        );
        bytes memory lockSig1 = _signLock(lockAuth1);
        vm.prank(user);
        settlement.lockPosition(lockAuth1, lockSig1);

        address user2 = vm.addr(0xFEED);
        usdc.mint(user2, 100_000_000);
        vm.prank(user2);
        usdc.approve(address(settlement), type(uint256).max);
        VadSettlementV1.LockAuthorization memory lockAuth2 =
            VadSettlementV1.LockAuthorization({
                authorizationId: keccak256("lock-auth-2"),
                positionId: keccak256("position-replay-2"),
                marketId: MARKET,
                outcomeId: YES,
                user: user2,
                collateralAmount: 100_000_000,
                tradingFeeAmount: 0,
                tradingFeePolicyVersion: 0,
                deadline: block.timestamp + 1 hours
            });
        bytes32 d2 = settlement.lockAuthorizationDigest(lockAuth2);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(QUOTE_SIGNER_KEY, d2);
        vm.prank(user2);
        settlement.lockPosition(lockAuth2, abi.encodePacked(r2, s2, v2));

        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, keccak256("ev-replay"));

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("replay-settle-id"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 100_000_000,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        bytes memory settleSig = _signSettlement(settleAuth);

        vm.prank(user);
        settlement.settlePosition(settleAuth, settleSig);

        // Replay: same authorizationId must fail
        vm.expectRevert(VadSettlementV1.AuthorizationAlreadyUsed.selector);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settleSig);
    }

    // -------------------------------------------------------------------------
    // Security: unauthorized settlement (wrong caller)
    // -------------------------------------------------------------------------

    function testUnauthorizedCallerCannotSettleAnotherUsersPosition() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION, 100_000_000, 0, 0
        );
        bytes memory lockSig = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSig);

        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, keccak256("ev-unauth"));

        address attacker = vm.addr(0xDEAD);

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("unauth-settle"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,       // real user, not attacker
                grossPayout: 100_000_000,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        bytes memory settleSig = _signSettlement(settleAuth);

        // attacker calls with user in auth.user — contract checks msg.sender == auth.user
        vm.expectRevert(VadSettlementV1.Unauthorized.selector);
        vm.prank(attacker);
        settlement.settlePosition(settleAuth, settleSig);
    }

    // -------------------------------------------------------------------------
    // Security: escrow underflow guard
    // -------------------------------------------------------------------------

    function testEscrowUnderflowRejected() public {
        // Lock a single position worth 50 USDC
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION, 50_000_000, 0, 0
        );
        bytes memory lockSig = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSig);

        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, keccak256("ev-underflow"));

        // Try to claim 100 USDC (double the escrow)
        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("overflow-settle"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 100_000_000,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        bytes memory settleSig = _signSettlement(settleAuth);
        vm.expectRevert(VadSettlementV1.InsufficientMarketEscrow.selector);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settleSig);
    }

    // -------------------------------------------------------------------------
    // Loser: zero-payout path (no funds disbursed, position marked SETTLED)
    // -------------------------------------------------------------------------

    function testLoserPositionCanBeMarkedSettledWithZeroPayout() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION, 100_000_000, 0, 0
        );
        lockAuth.outcomeId = NO;
        bytes memory lockSig = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSig);

        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, YES, false, keccak256("ev-loser"));

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("loser-settle"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 0,
                settlementFeeAmount: 0,
                settlementFeePolicyVersion: 0,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        uint256 userBefore = usdc.balanceOf(user);
        bytes memory settleSig = _signSettlement(settleAuth);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settleSig);

        _assertEq(usdc.balanceOf(user), userBefore, "loser receives nothing");
        (, , , , , , VadSettlementV1.PositionStatus status) = settlement.positions(POSITION);
        _assertEq(uint256(status), uint256(VadSettlementV1.PositionStatus.SETTLED), "loser position marked SETTLED");
    }

    // -------------------------------------------------------------------------
    // Admin: two-step transfer
    // -------------------------------------------------------------------------

    function testAdminTransferTwoStep() public {
        address newAdmin = address(0xA1A1);
        settlement.startAdminTransfer(newAdmin);
        _assertEq(settlement.pendingAdmin(), newAdmin, "pending admin set");

        // Non-pending cannot accept
        vm.expectRevert(VadSettlementV1.Unauthorized.selector);
        vm.prank(address(0xBAD));
        settlement.acceptAdmin();

        vm.prank(newAdmin);
        settlement.acceptAdmin();
        _assertEq(settlement.admin(), newAdmin, "admin transferred");
        _assertEq(settlement.pendingAdmin(), address(0), "pending cleared");
    }

    // -------------------------------------------------------------------------
    // Voided: fee must be zero (on-chain enforcement)
    // -------------------------------------------------------------------------

    function testVoidedMarketRejectsNonZeroSettlementFee() public {
        VadSettlementV1.LockAuthorization memory lockAuth = _lockAuthorization(
            POSITION, 75_000_000, 0, 0
        );
        bytes memory lockSig = _signLock(lockAuth);
        vm.prank(user);
        settlement.lockPosition(lockAuth, lockSig);

        vm.prank(resolver);
        bytes32 resolvedHash = settlement.resolveMarket(MARKET, bytes32(0), true, keccak256("void-ev2"));

        VadSettlementV1.SettlementAuthorization memory settleAuth =
            VadSettlementV1.SettlementAuthorization({
                authorizationId: keccak256("void-fee-nonzero"),
                positionId: POSITION,
                marketId: MARKET,
                user: user,
                grossPayout: 75_000_000,
                settlementFeeAmount: 1,   // must be 0 on void
                settlementFeePolicyVersion: 1,
                resolutionHash: resolvedHash,
                deadline: block.timestamp + 1 hours
            });

        bytes memory settleSig = _signSettlement(settleAuth);
        vm.expectRevert(VadSettlementV1.InvalidAmount.selector);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settleSig);
    }
}
