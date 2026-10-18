// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../src/VadSettlementV1.sol";

interface VmDeploy {
    function envUint(string calldata key) external returns (uint256);
    function envAddress(string calldata key) external returns (address);
    function envOr(string calldata key, bool defaultValue) external returns (bool);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployVadSettlementV1 {
    VmDeploy private constant vm =
        VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 public constant ARC_MAINNET_CHAIN_ID = 5042;
    address public constant ARC_MAINNET_USDC =
        address(0x3600000000000000000000000000000000000000);

    error WrongChain();
    error WrongMainnetSettlementToken();

    event SettlementDeployed(
        address indexed contractAddress,
        address indexed settlementToken,
        uint256 indexed chainId,
        address admin,
        address quoteSigner,
        address settlementSigner,
        address resolver,
        address treasury
    );

    /// @notice Deploys VAD Settlement V1. Mainnet is the default and is chain/token guarded.
    /// @dev Keep all keys in the environment/secret manager; never commit .env files.
    function run() external returns (VadSettlementV1 deployed) {
        uint256 deployerPrivateKey = vm.envUint("VAD_DEPLOYER_PRIVATE_KEY");
        address settlementToken = vm.envAddress("ARC_USDC_TOKEN_ADDRESS");
        address admin = vm.envAddress("VAD_ADMIN");
        address quoteSigner = vm.envAddress("VAD_QUOTE_SIGNER");
        address settlementSigner = vm.envAddress("VAD_SETTLEMENT_SIGNER");
        address resolver = vm.envAddress("VAD_RESOLVER");
        address treasury = vm.envAddress("VAD_TREASURY");
        bool allowNonMainnet = vm.envOr("ALLOW_NON_MAINNET_DEPLOY", false);

        if (block.chainid != ARC_MAINNET_CHAIN_ID && !allowNonMainnet) {
            revert WrongChain();
        }
        if (
            block.chainid == ARC_MAINNET_CHAIN_ID &&
            settlementToken != ARC_MAINNET_USDC
        ) {
            revert WrongMainnetSettlementToken();
        }

        vm.startBroadcast(deployerPrivateKey);
        deployed = new VadSettlementV1(
            settlementToken,
            admin,
            quoteSigner,
            settlementSigner,
            resolver,
            treasury
        );
        vm.stopBroadcast();

        emit SettlementDeployed(
            address(deployed),
            settlementToken,
            block.chainid,
            admin,
            quoteSigner,
            settlementSigner,
            resolver,
            treasury
        );
    }
}
