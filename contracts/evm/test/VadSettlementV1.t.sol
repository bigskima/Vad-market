// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../src/VadSettlementV1.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
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

        vm.expectRevert(VadSettlementV1.InvalidAmount.selector);
        bytes memory settlementSignature = _signSettlement(settleAuth);
        vm.prank(user);
        settlement.settlePosition(settleAuth, settlementSignature);
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
}
