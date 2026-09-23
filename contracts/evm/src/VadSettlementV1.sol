// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title VAD Settlement V1
/// @notice USDC settlement escrow for VAD markets.
/// @dev Fee rates do not live in this contract. VAD's governed fee engine resolves
///      the exact fee amount and policy version off-chain, then the trusted VAD
///      signer authorizes those immutable values for the user's transaction.
contract VadSettlementV1 {
    enum PositionStatus {
        NONE,
        LOCKED,
        SETTLED
    }

    struct Position {
        address user;
        bytes32 marketId;
        bytes32 outcomeId;
        uint256 collateralAmount;
        uint256 tradingFeeAmount;
        uint256 tradingFeePolicyVersion;
        PositionStatus status;
    }

    struct Resolution {
        bytes32 winningOutcomeId;
        bytes32 evidenceHash;
        bool resolved;
        bool voided;
        uint64 resolvedAt;
    }

    struct LockAuthorization {
        bytes32 authorizationId;
        bytes32 positionId;
        bytes32 marketId;
        bytes32 outcomeId;
        address user;
        uint256 collateralAmount;
        uint256 tradingFeeAmount;
        uint256 tradingFeePolicyVersion;
        uint256 deadline;
    }

    struct SettlementAuthorization {
        bytes32 authorizationId;
        bytes32 positionId;
        bytes32 marketId;
        address user;
        uint256 grossPayout;
        uint256 settlementFeeAmount;
        uint256 settlementFeePolicyVersion;
        bytes32 resolutionHash;
        uint256 deadline;
    }

    error Unauthorized();
    error ZeroAddress();
    error InvalidAmount();
    error InvalidState();
    error AuthorizationExpired();
    error AuthorizationAlreadyUsed();
    error PositionAlreadyExists();
    error PositionNotFound();
    error InvalidAuthorizationSignature();
    error InvalidResolution();
    error InsufficientMarketEscrow();
    error NewLocksPaused();
    error TokenTransferFailed();
    error SettlementTokenRecoveryForbidden();

    event PositionLocked(
        bytes32 indexed positionId,
        bytes32 indexed marketId,
        bytes32 indexed outcomeId,
        address user,
        uint256 collateralAmount,
        uint256 tradingFeeAmount,
        uint256 tradingFeePolicyVersion
    );
    event TradingFeeCollected(
        bytes32 indexed positionId,
        address indexed user,
        uint256 feeAmount,
        uint256 policyVersion
    );
    event MarketResolved(
        bytes32 indexed marketId,
        bytes32 indexed winningOutcomeId,
        bool voided,
        bytes32 evidenceHash,
        bytes32 resolutionHash
    );
    event PositionSettled(
        bytes32 indexed positionId,
        bytes32 indexed marketId,
        address indexed user,
        uint256 grossPayout,
        uint256 settlementFeeAmount,
        uint256 netPayout,
        uint256 settlementFeePolicyVersion,
        bytes32 resolutionHash
    );
    event SettlementFeeCollected(
        bytes32 indexed positionId,
        address indexed user,
        uint256 feeAmount,
        uint256 policyVersion
    );
    event QuoteSignerChanged(address indexed previousSigner, address indexed nextSigner);
    event SettlementSignerChanged(address indexed previousSigner, address indexed nextSigner);
    event ResolverChanged(address indexed previousResolver, address indexed nextResolver);
    event TreasuryChanged(address indexed previousTreasury, address indexed nextTreasury);
    event NewLocksPauseChanged(bool paused);
    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed nextAdmin);

    string public constant NAME = "VAD Settlement";
    string public constant VERSION = "1";
    uint256 public constant PROTOCOL_VERSION = 1;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant LOCK_AUTHORIZATION_TYPEHASH = keccak256(
        "LockAuthorization(bytes32 authorizationId,bytes32 positionId,bytes32 marketId,bytes32 outcomeId,address user,uint256 collateralAmount,uint256 tradingFeeAmount,uint256 tradingFeePolicyVersion,uint256 deadline)"
    );
    bytes32 public constant SETTLEMENT_AUTHORIZATION_TYPEHASH = keccak256(
        "SettlementAuthorization(bytes32 authorizationId,bytes32 positionId,bytes32 marketId,address user,uint256 grossPayout,uint256 settlementFeeAmount,uint256 settlementFeePolicyVersion,bytes32 resolutionHash,uint256 deadline)"
    );

    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    IERC20 public immutable settlementToken;

    address public admin;
    address public pendingAdmin;
    address public quoteSigner;
    address public settlementSigner;
    address public resolver;
    address public treasury;
    bool public newLocksPaused;

    uint256 private immutable initialChainId;
    bytes32 private immutable initialDomainSeparator;
    uint256 private reentrancyState = 1;

    mapping(bytes32 => bool) public usedAuthorizations;
    mapping(bytes32 => Position) public positions;
    mapping(bytes32 => Resolution) public resolutions;
    mapping(bytes32 => uint256) public marketEscrow;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (reentrancyState != 1) revert InvalidState();
        reentrancyState = 2;
        _;
        reentrancyState = 1;
    }

    constructor(
        address settlementToken_,
        address admin_,
        address quoteSigner_,
        address settlementSigner_,
        address resolver_,
        address treasury_
    ) {
        if (
            settlementToken_ == address(0) ||
            admin_ == address(0) ||
            quoteSigner_ == address(0) ||
            settlementSigner_ == address(0) ||
            resolver_ == address(0) ||
            treasury_ == address(0)
        ) revert ZeroAddress();

        settlementToken = IERC20(settlementToken_);
        admin = admin_;
        quoteSigner = quoteSigner_;
        settlementSigner = settlementSigner_;
        resolver = resolver_;
        treasury = treasury_;

        initialChainId = block.chainid;
        initialDomainSeparator = _buildDomainSeparator();
    }

    function domainSeparator() public view returns (bytes32) {
        return block.chainid == initialChainId ? initialDomainSeparator : _buildDomainSeparator();
    }

    function lockAuthorizationDigest(
        LockAuthorization calldata authorization
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                LOCK_AUTHORIZATION_TYPEHASH,
                authorization.authorizationId,
                authorization.positionId,
                authorization.marketId,
                authorization.outcomeId,
                authorization.user,
                authorization.collateralAmount,
                authorization.tradingFeeAmount,
                authorization.tradingFeePolicyVersion,
                authorization.deadline
            )
        );
        return _toTypedDataHash(structHash);
    }

    function settlementAuthorizationDigest(
        SettlementAuthorization calldata authorization
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                SETTLEMENT_AUTHORIZATION_TYPEHASH,
                authorization.authorizationId,
                authorization.positionId,
                authorization.marketId,
                authorization.user,
                authorization.grossPayout,
                authorization.settlementFeeAmount,
                authorization.settlementFeePolicyVersion,
                authorization.resolutionHash,
                authorization.deadline
            )
        );
        return _toTypedDataHash(structHash);
    }

    function resolutionHash(
        bytes32 marketId,
        bytes32 winningOutcomeId,
        bool voided,
        bytes32 evidenceHash
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(marketId, winningOutcomeId, voided, evidenceHash));
    }

    function lockPosition(
        LockAuthorization calldata authorization,
        bytes calldata signature
    ) external nonReentrant {
        if (newLocksPaused) revert NewLocksPaused();
        if (authorization.user != msg.sender) revert Unauthorized();
        if (
            authorization.authorizationId == bytes32(0) ||
            authorization.positionId == bytes32(0) ||
            authorization.marketId == bytes32(0) ||
            authorization.outcomeId == bytes32(0)
        ) revert InvalidState();
        if (authorization.collateralAmount == 0) revert InvalidAmount();
        if (authorization.deadline < block.timestamp) revert AuthorizationExpired();
        if (usedAuthorizations[authorization.authorizationId]) revert AuthorizationAlreadyUsed();
        if (positions[authorization.positionId].status != PositionStatus.NONE) {
            revert PositionAlreadyExists();
        }
        if (
            authorization.tradingFeeAmount > 0 &&
            authorization.tradingFeePolicyVersion == 0
        ) revert InvalidState();

        address recovered = _recover(
            lockAuthorizationDigest(authorization),
            signature
        );
        if (recovered != quoteSigner) revert InvalidAuthorizationSignature();

        usedAuthorizations[authorization.authorizationId] = true;
        positions[authorization.positionId] = Position({
            user: authorization.user,
            marketId: authorization.marketId,
            outcomeId: authorization.outcomeId,
            collateralAmount: authorization.collateralAmount,
            tradingFeeAmount: authorization.tradingFeeAmount,
            tradingFeePolicyVersion: authorization.tradingFeePolicyVersion,
            status: PositionStatus.LOCKED
        });
        marketEscrow[authorization.marketId] += authorization.collateralAmount;

        uint256 totalDebit =
            authorization.collateralAmount + authorization.tradingFeeAmount;
        _safeTransferFrom(
            settlementToken,
            authorization.user,
            address(this),
            totalDebit
        );

        if (authorization.tradingFeeAmount > 0) {
            _safeTransfer(
                settlementToken,
                treasury,
                authorization.tradingFeeAmount
            );
            emit TradingFeeCollected(
                authorization.positionId,
                authorization.user,
                authorization.tradingFeeAmount,
                authorization.tradingFeePolicyVersion
            );
        }

        emit PositionLocked(
            authorization.positionId,
            authorization.marketId,
            authorization.outcomeId,
            authorization.user,
            authorization.collateralAmount,
            authorization.tradingFeeAmount,
            authorization.tradingFeePolicyVersion
        );
    }

    function resolveMarket(
        bytes32 marketId,
        bytes32 winningOutcomeId,
        bool voided,
        bytes32 evidenceHash
    ) external onlyResolver returns (bytes32 resolvedHash) {
        if (marketId == bytes32(0) || evidenceHash == bytes32(0)) {
            revert InvalidResolution();
        }
        if (!voided && winningOutcomeId == bytes32(0)) {
            revert InvalidResolution();
        }
        if (resolutions[marketId].resolved) revert InvalidState();

        resolutions[marketId] = Resolution({
            winningOutcomeId: winningOutcomeId,
            evidenceHash: evidenceHash,
            resolved: true,
            voided: voided,
            resolvedAt: uint64(block.timestamp)
        });

        resolvedHash = resolutionHash(
            marketId,
            winningOutcomeId,
            voided,
            evidenceHash
        );

        emit MarketResolved(
            marketId,
            winningOutcomeId,
            voided,
            evidenceHash,
            resolvedHash
        );
    }

    function settlePosition(
        SettlementAuthorization calldata authorization,
        bytes calldata signature
    ) external nonReentrant {
        if (authorization.user != msg.sender) revert Unauthorized();
        if (authorization.deadline < block.timestamp) revert AuthorizationExpired();
        if (usedAuthorizations[authorization.authorizationId]) revert AuthorizationAlreadyUsed();
        if (
            authorization.authorizationId == bytes32(0) ||
            authorization.positionId == bytes32(0) ||
            authorization.marketId == bytes32(0)
        ) revert InvalidState();
        if (authorization.settlementFeeAmount > authorization.grossPayout) {
            revert InvalidAmount();
        }
        if (
            authorization.settlementFeeAmount > 0 &&
            authorization.settlementFeePolicyVersion == 0
        ) revert InvalidState();

        Position storage position = positions[authorization.positionId];
        if (position.status == PositionStatus.NONE) revert PositionNotFound();
        if (position.status != PositionStatus.LOCKED) revert InvalidState();
        if (
            position.user != authorization.user ||
            position.marketId != authorization.marketId
        ) revert InvalidState();

        Resolution storage marketResolution = resolutions[authorization.marketId];
        if (!marketResolution.resolved) revert InvalidResolution();

        bytes32 expectedResolutionHash = resolutionHash(
            authorization.marketId,
            marketResolution.winningOutcomeId,
            marketResolution.voided,
            marketResolution.evidenceHash
        );
        if (authorization.resolutionHash != expectedResolutionHash) {
            revert InvalidResolution();
        }

        if (marketResolution.voided) {
            if (
                authorization.grossPayout != position.collateralAmount ||
                authorization.settlementFeeAmount != 0
            ) revert InvalidAmount();
        } else if (position.outcomeId != marketResolution.winningOutcomeId) {
            if (
                authorization.grossPayout != 0 ||
                authorization.settlementFeeAmount != 0
            ) revert InvalidAmount();
        } else if (authorization.grossPayout == 0) {
            revert InvalidAmount();
        }

        address recovered = _recover(
            settlementAuthorizationDigest(authorization),
            signature
        );
        if (recovered != settlementSigner) revert InvalidAuthorizationSignature();

        if (authorization.grossPayout > marketEscrow[authorization.marketId]) {
            revert InsufficientMarketEscrow();
        }

        usedAuthorizations[authorization.authorizationId] = true;
        position.status = PositionStatus.SETTLED;
        marketEscrow[authorization.marketId] -= authorization.grossPayout;

        uint256 netPayout =
            authorization.grossPayout - authorization.settlementFeeAmount;

        if (authorization.settlementFeeAmount > 0) {
            _safeTransfer(
                settlementToken,
                treasury,
                authorization.settlementFeeAmount
            );
            emit SettlementFeeCollected(
                authorization.positionId,
                authorization.user,
                authorization.settlementFeeAmount,
                authorization.settlementFeePolicyVersion
            );
        }
        if (netPayout > 0) {
            _safeTransfer(settlementToken, authorization.user, netPayout);
        }

        emit PositionSettled(
            authorization.positionId,
            authorization.marketId,
            authorization.user,
            authorization.grossPayout,
            authorization.settlementFeeAmount,
            netPayout,
            authorization.settlementFeePolicyVersion,
            expectedResolutionHash
        );
    }

    function startAdminTransfer(address nextAdmin) external onlyAdmin {
        if (nextAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = nextAdmin;
        emit AdminTransferStarted(admin, nextAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert Unauthorized();
        address previous = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferred(previous, admin);
    }

    function setQuoteSigner(address nextSigner) external onlyAdmin {
        if (nextSigner == address(0)) revert ZeroAddress();
        address previous = quoteSigner;
        quoteSigner = nextSigner;
        emit QuoteSignerChanged(previous, nextSigner);
    }

    function setSettlementSigner(address nextSigner) external onlyAdmin {
        if (nextSigner == address(0)) revert ZeroAddress();
        address previous = settlementSigner;
        settlementSigner = nextSigner;
        emit SettlementSignerChanged(previous, nextSigner);
    }

    function setResolver(address nextResolver) external onlyAdmin {
        if (nextResolver == address(0)) revert ZeroAddress();
        address previous = resolver;
        resolver = nextResolver;
        emit ResolverChanged(previous, nextResolver);
    }

    function setTreasury(address nextTreasury) external onlyAdmin {
        if (nextTreasury == address(0)) revert ZeroAddress();
        address previous = treasury;
        treasury = nextTreasury;
        emit TreasuryChanged(previous, nextTreasury);
    }

    /// @notice Pauses only new position locks. Resolution and user settlement remain available.
    function setNewLocksPaused(bool paused) external onlyAdmin {
        newLocksPaused = paused;
        emit NewLocksPauseChanged(paused);
    }

    /// @notice Recover unrelated tokens accidentally sent to this contract.
    /// @dev The configured settlement token can never be recovered through this path.
    function recoverNonSettlementToken(
        address token,
        address recipient,
        uint256 amount
    ) external onlyAdmin nonReentrant {
        if (token == address(settlementToken)) revert SettlementTokenRecoveryForbidden();
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        _safeTransfer(IERC20(token), recipient, amount);
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                block.chainid,
                address(this)
            )
        );
    }

    function _toTypedDataHash(bytes32 structHash) private view returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19\x01", domainSeparator(), structHash)
        );
    }

    function _recover(
        bytes32 digest,
        bytes calldata signature
    ) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidAuthorizationSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (uint256(s) > SECP256K1N_HALF) revert InvalidAuthorizationSignature();
        if (v != 27 && v != 28) revert InvalidAuthorizationSignature();

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidAuthorizationSignature();
    }

    function _safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) private {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeCall(IERC20.transferFrom, (from, to, amount))
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _safeTransfer(
        IERC20 token,
        address to,
        uint256 amount
    ) private {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
