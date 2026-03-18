// scripts/deploy.js  — ethers v6 + Hardhat compatible
// Usage:
//   npx hardhat run scripts/deploy.js --network base-sepolia
//   npx hardhat run scripts/deploy.js --network base

const { ethers, network, run } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  // ethers v6 with Hardhat: use deployer.provider, not ethers.provider
  const balance = await deployer.provider.getBalance(deployer.address);

  console.log("─".repeat(60));
  console.log("  MedVaultRegistry Deployment");
  console.log("─".repeat(60));
  console.log(`  Network   : ${network.name} (chainId ${network.config.chainId})`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(balance)} ETH`);
  console.log("─".repeat(60));

  if (balance === 0n) {
    throw new Error(
      `Deployer wallet has 0 ETH. Fund it first:\n` +
      `  Base Sepolia faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet\n` +
      `  Base Mainnet:        bridge ETH from Ethereum via https://bridge.base.org`
    );
  }

  // ── Deploy ──────────────────────────────────────────────────────────────
  console.log("\n📦  Deploying MedVaultRegistry…");
  const Factory  = await ethers.getContractFactory("MedVaultRegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address  = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  if (!deployTx) throw new Error("deploymentTransaction() returned null");

  console.log(`\n✅  Deployed at : ${address}`);
  console.log(`    Tx hash     : ${deployTx.hash}`);

  // ── Save deployment record ───────────────────────────────────────────────
  const deployments = loadDeployments();
  deployments[network.name] = {
    address,
    deployer:    deployer.address,
    txHash:      deployTx.hash,
    timestamp:   new Date().toISOString(),
    chainId:     network.config.chainId,
  };
  saveDeployments(deployments);
  console.log(`\n💾  Saved to deployments.json`);

  // ── BaseScan verification ────────────────────────────────────────────────
  if (process.env.BASESCAN_API_KEY && network.name !== "hardhat") {
    console.log("\n⏳  Waiting 5 blocks before verification…");
    await deployTx.wait(5);
    console.log("🔍  Verifying on BaseScan…");
    try {
      await run("verify:verify", { address, constructorArguments: [] });
      console.log("✅  Verified!");
    } catch (e) {
      console.warn("⚠   Verification failed:", e.message);
      console.warn(`    Retry: npx hardhat verify --network ${network.name} ${address}`);
    }
  } else {
    console.log(`\n⚠   No BASESCAN_API_KEY set — skipping verification.`);
    if (network.name !== "hardhat") {
      console.log(`    Verify manually:\n    npx hardhat verify --network ${network.name} ${address}`);
    }
  }

  console.log("\n─".repeat(60));
  console.log("  Deployment complete. Add to your frontend/.env.local:");
  console.log(`  VITE_CONTRACT_ADDRESS=${address}`);
  console.log("─".repeat(60));
}

const DEPLOYMENTS_FILE = path.join(__dirname, "..", "deployments.json");

function loadDeployments() {
  if (!fs.existsSync(DEPLOYMENTS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf8")); } catch { return {}; }
}

function saveDeployments(data) {
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(data, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });