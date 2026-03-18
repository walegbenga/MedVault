// test/MedVaultRegistry.test.js
// ethers v6 compatible
const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// ── Helpers ────────────────────────────────────────────────────────────────
const id    = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const cid   = (n) => `QmTest${String(n).padStart(4, "0")}`;
const future = () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
const past   = () => Math.floor(Date.now() / 1000) - 1;

// ── Fixture ────────────────────────────────────────────────────────────────
async function deployFixture() {
  const [owner, doctor, insurer, researcher, stranger] =
    await ethers.getSigners();

  const Factory  = await ethers.getContractFactory("MedVaultRegistry");
  const registry = await Factory.connect(owner).deploy();
  await registry.waitForDeployment();

  return { registry, owner, doctor, insurer, researcher, stranger };
}

// ══════════════════════════════════════════════════════════════════════════
describe("MedVaultRegistry", function () {

  // ── Deployment ────────────────────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets deployer as owner", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("starts with zero records and zero grants", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.getRecordCount()).to.equal(0n);
      expect(await registry.getGrantCount()).to.equal(0n);
      expect(await registry.grantCount()).to.equal(0n);
    });
  });

  // ── addRecord ────────────────────────────────────────────────────────────
  describe("addRecord", function () {
    it("owner can add a record", async function () {
      const { registry } = await loadFixture(deployFixture);
      const rid = id("record-1");

      await expect(registry.addRecord(rid, cid(1), "Lab Results", "Blood Panel"))
        .to.emit(registry, "RecordAdded")
        .withArgs(rid, cid(1), "Lab Results", "Blood Panel", (ts) => ts > 0n);

      expect(await registry.getRecordCount()).to.equal(1n);
      const rec = await registry.records(rid);
      expect(rec.active).to.be.true;
      expect(rec.ipfsCid).to.equal(cid(1));
      expect(rec.recordType).to.equal("Lab Results");
      expect(rec.title).to.equal("Blood Panel");
    });

    it("non-owner cannot add a record", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("record-x");
      await expect(
        registry.connect(doctor).addRecord(rid, cid(1), "Lab", "Test")
      ).to.be.revertedWith("MedVault: caller is not owner");
    });

    it("cannot add the same record ID twice", async function () {
      const { registry } = await loadFixture(deployFixture);
      const rid = id("record-dup");
      await registry.addRecord(rid, cid(1), "Lab", "Test");
      await expect(
        registry.addRecord(rid, cid(2), "Lab", "Test2")
      ).to.be.revertedWith("MedVault: record already exists");
    });

    it("record count increments correctly", async function () {
      const { registry } = await loadFixture(deployFixture);
      for (let i = 0; i < 5; i++) {
        await registry.addRecord(id(`r-${i}`), cid(i), "Lab", `Test ${i}`);
      }
      expect(await registry.getRecordCount()).to.equal(5n);
    });
  });

  // ── removeRecord ─────────────────────────────────────────────────────────
  describe("removeRecord", function () {
    it("owner can remove an existing record", async function () {
      const { registry } = await loadFixture(deployFixture);
      const rid = id("record-del");
      await registry.addRecord(rid, cid(1), "Lab", "Delete Me");

      await expect(registry.removeRecord(rid))
        .to.emit(registry, "RecordRemoved")
        .withArgs(rid);

      const rec = await registry.records(rid);
      expect(rec.active).to.be.false;
    });

    it("cannot remove a record that does not exist", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.removeRecord(id("ghost"))
      ).to.be.revertedWith("MedVault: record not found or already removed");
    });

    it("cannot remove an already removed record", async function () {
      const { registry } = await loadFixture(deployFixture);
      const rid = id("double-del");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.removeRecord(rid);
      await expect(registry.removeRecord(rid)).to.be.revertedWith(
        "MedVault: record not found or already removed"
      );
    });

    it("record count still reflects total including removed", async function () {
      const { registry } = await loadFixture(deployFixture);
      const rid = id("r-removed");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.removeRecord(rid);
      expect(await registry.getRecordCount()).to.equal(1n);
    });
  });

  // ── grantAccess ──────────────────────────────────────────────────────────
  describe("grantAccess", function () {
    async function withRecord(fixture) {
      const { registry } = fixture;
      const rid = id("rec-for-grant");
      await registry.addRecord(rid, cid(1), "Lab", "Panel");
      return { ...fixture, rid };
    }

    it("owner can grant access", async function () {
      const f = await loadFixture(deployFixture);
      const { registry, doctor, rid } = await withRecord(f);
      await expect(registry.grantAccess(doctor.address, [rid], future()))
        .to.emit(registry, "AccessGranted")
        .withArgs(0n, doctor.address, [rid], (exp) => exp > 0n);
      expect(await registry.grantCount()).to.equal(1n);
    });

    it("non-owner cannot grant access", async function () {
      const f = await loadFixture(deployFixture);
      const { registry, doctor, insurer, rid } = await withRecord(f);
      await expect(
        registry.connect(doctor).grantAccess(insurer.address, [rid], future())
      ).to.be.revertedWith("MedVault: caller is not owner");
    });

    it("reverts for zero address grantee", async function () {
      const f = await loadFixture(deployFixture);
      const { registry, rid } = await withRecord(f);
      await expect(
        registry.grantAccess(ethers.ZeroAddress, [rid], future())
      ).to.be.revertedWith("MedVault: zero address");
    });

    it("reverts when no records specified", async function () {
      const f = await loadFixture(deployFixture);
      const { registry, doctor } = await withRecord(f);
      await expect(
        registry.grantAccess(doctor.address, [], future())
      ).to.be.revertedWith("MedVault: no records specified");
    });

    it("grant IDs increment across multiple grants", async function () {
      const f = await loadFixture(deployFixture);
      const { registry, doctor, insurer, rid } = await withRecord(f);
      await registry.grantAccess(doctor.address,  [rid], future());
      await registry.grantAccess(insurer.address, [rid], future());
      expect(await registry.grantCount()).to.equal(2n);
    });
  });

  // ── revokeAccess ─────────────────────────────────────────────────────────
  describe("revokeAccess", function () {
    it("owner can revoke an active grant", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("rec-revoke");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(doctor.address, [rid], future());

      await expect(registry.revokeAccess(0n))
        .to.emit(registry, "AccessRevoked")
        .withArgs(0n, doctor.address);

      const g = await registry.grants(0n);
      expect(g.active).to.be.false;
    });

    it("cannot revoke an already-revoked grant", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("rec-rev2");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(doctor.address, [rid], future());
      await registry.revokeAccess(0n);
      await expect(registry.revokeAccess(0n)).to.be.revertedWith(
        "MedVault: grant not active"
      );
    });

    it("non-owner cannot revoke", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("rec-rev3");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(doctor.address, [rid], future());
      await expect(
        registry.connect(doctor).revokeAccess(0n)
      ).to.be.revertedWith("MedVault: caller is not owner");
    });
  });

  // ── canAccess ────────────────────────────────────────────────────────────
  describe("canAccess", function () {
    it("returns true for a valid active grant", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("rec-can");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(doctor.address, [rid], future());
      expect(await registry.canAccess(doctor.address, rid)).to.be.true;
    });

    it("returns false after revocation", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("rec-can-rev");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(doctor.address, [rid], future());
      await registry.revokeAccess(0n);
      expect(await registry.canAccess(doctor.address, rid)).to.be.false;
    });

    it("returns false for an address never granted", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);
      const rid = id("rec-stranger");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      expect(await registry.canAccess(stranger.address, rid)).to.be.false;
    });

    it("returns false for an expired grant", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("rec-expired");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(doctor.address, [rid], past());
      expect(await registry.canAccess(doctor.address, rid)).to.be.false;
    });

    it("returns true for a permanent grant (expiresAt = 0)", async function () {
      const { registry, insurer } = await loadFixture(deployFixture);
      const rid = id("rec-perm");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(insurer.address, [rid], 0);
      expect(await registry.canAccess(insurer.address, rid)).to.be.true;
    });

    it("grants access only to specified records", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid1 = id("rec-a");
      const rid2 = id("rec-b");
      await registry.addRecord(rid1, cid(1), "Lab", "A");
      await registry.addRecord(rid2, cid(2), "Lab", "B");
      await registry.grantAccess(doctor.address, [rid1], future());
      expect(await registry.canAccess(doctor.address, rid1)).to.be.true;
      expect(await registry.canAccess(doctor.address, rid2)).to.be.false;
    });
  });

  // ── accessibleRecords ─────────────────────────────────────────────────────
  describe("accessibleRecords", function () {
    it("returns all records accessible to a grantee", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid1 = id("ar-1");
      const rid2 = id("ar-2");
      await registry.addRecord(rid1, cid(1), "Lab", "A");
      await registry.addRecord(rid2, cid(2), "Lab", "B");
      await registry.grantAccess(doctor.address, [rid1, rid2], future());
      const accessible = await registry.accessibleRecords(doctor.address);
      expect(accessible.length).to.equal(2);
      expect(accessible).to.include(rid1);
      expect(accessible).to.include(rid2);
    });

    it("excludes revoked grants", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("ar-rev");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(doctor.address, [rid], future());
      await registry.revokeAccess(0n);
      const accessible = await registry.accessibleRecords(doctor.address);
      expect(accessible.length).to.equal(0);
    });

    it("excludes expired grants", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid = id("ar-exp");
      await registry.addRecord(rid, cid(1), "Lab", "X");
      await registry.grantAccess(doctor.address, [rid], past());
      const accessible = await registry.accessibleRecords(doctor.address);
      expect(accessible.length).to.equal(0);
    });
  });

  // ── getRecordIds pagination ───────────────────────────────────────────────
  describe("getRecordIds (pagination)", function () {
    it("paginates correctly", async function () {
      const { registry } = await loadFixture(deployFixture);
      const ids = [];
      for (let i = 0; i < 6; i++) {
        const rid = id(`page-${i}`);
        ids.push(rid);
        await registry.addRecord(rid, cid(i), "Lab", `Test ${i}`);
      }
      const page1 = await registry.getRecordIds(0, 3);
      const page2 = await registry.getRecordIds(3, 3);
      expect(page1.length).to.equal(3);
      expect(page2.length).to.equal(3);
      expect([...page1, ...page2]).to.deep.equal(ids);
    });

    it("handles limit exceeding total count", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.addRecord(id("p-1"), cid(1), "Lab", "X");
      const page = await registry.getRecordIds(0, 100);
      expect(page.length).to.equal(1);
    });
  });

  // ── getGrantRecordIds ─────────────────────────────────────────────────────
  describe("getGrantRecordIds", function () {
    it("returns the record IDs for a grant", async function () {
      const { registry, doctor } = await loadFixture(deployFixture);
      const rid1 = id("gg-1");
      const rid2 = id("gg-2");
      await registry.addRecord(rid1, cid(1), "Lab", "A");
      await registry.addRecord(rid2, cid(2), "Lab", "B");
      await registry.grantAccess(doctor.address, [rid1, rid2], future());
      const grantRids = await registry.getGrantRecordIds(0n);
      expect(grantRids.length).to.equal(2);
      expect(grantRids).to.include(rid1);
      expect(grantRids).to.include(rid2);
    });
  });

  // ── Multi-grantee ─────────────────────────────────────────────────────────
  describe("Multi-grantee scenarios", function () {
    it("different grantees access different records", async function () {
      const { registry, doctor, insurer } = await loadFixture(deployFixture);
      const rid1 = id("mg-1");
      const rid2 = id("mg-2");
      await registry.addRecord(rid1, cid(1), "Lab", "A");
      await registry.addRecord(rid2, cid(2), "Rx",  "B");
      await registry.grantAccess(doctor.address,  [rid1], future());
      await registry.grantAccess(insurer.address, [rid2], future());
      expect(await registry.canAccess(doctor.address,  rid1)).to.be.true;
      expect(await registry.canAccess(doctor.address,  rid2)).to.be.false;
      expect(await registry.canAccess(insurer.address, rid1)).to.be.false;
      expect(await registry.canAccess(insurer.address, rid2)).to.be.true;
    });

    it("revoking one grant does not affect another grantee", async function () {
      const { registry, doctor, insurer } = await loadFixture(deployFixture);
      const rid = id("mg-shared");
      await registry.addRecord(rid, cid(1), "Lab", "Shared");
      await registry.grantAccess(doctor.address,  [rid], future()); // grantId=0
      await registry.grantAccess(insurer.address, [rid], future()); // grantId=1
      await registry.revokeAccess(0n); // revoke doctor only
      expect(await registry.canAccess(doctor.address,  rid)).to.be.false;
      expect(await registry.canAccess(insurer.address, rid)).to.be.true;
    });
  });

});
