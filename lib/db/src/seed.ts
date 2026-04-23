import { db, labelsTable, artistsTable, releasesTable, tracksTable, usersTable, contactsTable, crmTasksTable, transactionsTable, deliveriesTable, activityLogTable, publishingWorksTable, payoutsTable, splitsTable } from "./index";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  const [label1] = await db.insert(labelsTable).values({ name: "Tajik Sounds Records", country: "TJ", website: "https://tajik-sounds.tj", status: "active" }).returning();
  const [label2] = await db.insert(labelsTable).values({ name: "Silk Road Music", country: "TJ", website: "https://silkroad-music.com", status: "active" }).returning();
  console.log("Labels seeded");

  const [artist1] = await db.insert(artistsTable).values({ name: "Daler Nazarov", slug: "daler-nazarov", genre: "Folk Pop", country: "TJ", labelId: label1.id, bio: "Legendary Tajik folk singer", status: "active" }).returning();
  const [artist2] = await db.insert(artistsTable).values({ name: "Manija", slug: "manija", genre: "Pop", country: "TJ", labelId: label1.id, bio: "International Tajik pop star, Eurovision 2021 participant", status: "active" }).returning();
  const [artist3] = await db.insert(artistsTable).values({ name: "Firuza Hafizova", slug: "firuza-hafizova", genre: "Classical", country: "TJ", labelId: label2.id, bio: "Classical vocalist", status: "active" }).returning();
  const [artist4] = await db.insert(artistsTable).values({ name: "Parviz Nazarov", slug: "parviz-nazarov", genre: "Hip-Hop", country: "TJ", labelId: label2.id, bio: "Tajik rapper and songwriter", status: "active" }).returning();
  console.log("Artists seeded");

  const [release1] = await db.insert(releasesTable).values({ title: "Bahor", releaseType: "album", status: "live", upc: "7908000000001", artistId: artist1.id, labelId: label1.id, genre: "Folk Pop", releaseDate: "2024-03-21", isExplicit: false, territories: ["WW"] }).returning();
  const [release2] = await db.insert(releasesTable).values({ title: "Khuroson", releaseType: "single", status: "delivering", upc: "7908000000002", artistId: artist2.id, labelId: label1.id, genre: "Pop", releaseDate: "2024-06-15", isExplicit: false, territories: ["WW"] }).returning();
  const [release3] = await db.insert(releasesTable).values({ title: "Dushanbe Night", releaseType: "ep", status: "pending_review", upc: "7908000000003", artistId: artist3.id, labelId: label2.id, genre: "Classical", releaseDate: "2024-09-01", isExplicit: false, territories: ["WW"] }).returning();
  const [release4] = await db.insert(releasesTable).values({ title: "Street Stories", releaseType: "album", status: "draft", upc: "7908000000004", artistId: artist4.id, labelId: label2.id, genre: "Hip-Hop", releaseDate: "2024-12-01", isExplicit: true, territories: ["WW"] }).returning();
  const [release5] = await db.insert(releasesTable).values({ title: "Oshiqona", releaseType: "single", status: "approved", upc: "7908000000005", artistId: artist1.id, labelId: label1.id, genre: "Folk", releaseDate: "2024-11-01", isExplicit: false, territories: ["WW"] }).returning();
  console.log("Releases seeded");

  await db.insert(tracksTable).values([
    { title: "Bahor (Spring)", isrc: "TJSND24001001", releaseId: release1.id, artistId: artist1.id, trackNumber: 1, durationSeconds: 245, genre: "Folk Pop", isExplicit: false },
    { title: "Dar Dil", isrc: "TJSND24001002", releaseId: release1.id, artistId: artist1.id, trackNumber: 2, durationSeconds: 198, genre: "Folk Pop", isExplicit: false },
    { title: "Khuroson", isrc: "TJSND24002001", releaseId: release2.id, artistId: artist2.id, trackNumber: 1, durationSeconds: 213, genre: "Pop", isExplicit: false },
    { title: "Dushanbe Night", isrc: "TJSND24003001", releaseId: release3.id, artistId: artist3.id, trackNumber: 1, durationSeconds: 412, genre: "Classical", isExplicit: false },
    { title: "Kuchabo", isrc: "TJSND24004001", releaseId: release4.id, artistId: artist4.id, trackNumber: 1, durationSeconds: 183, genre: "Hip-Hop", isExplicit: true },
  ]);
  console.log("Tracks seeded");

  const hash = (p: string) => bcrypt.hashSync(p, 10);
  await db.insert(usersTable).values([
    { name: "Admin User",         email: "admin@tajikmusic.com",   role: "admin",   status: "active", passwordHash: hash("admin123") },
    { name: "Рустам Назаров",     email: "manager@tajikmusic.com", role: "manager", status: "active", passwordHash: hash("manager123") },
    { name: "Tajik Sounds Records", email: "label@tajikmusic.com", role: "label",   status: "active", labelId: label1.id, passwordHash: hash("label123") },
    { name: "Daler Nazarov",      email: "artist@tajikmusic.com",  role: "artist",  status: "active", artistId: artist1.id, passwordHash: hash("artist123") },
  ]);
  console.log("Users seeded (with password hashes)");

  await db.insert(contactsTable).values([
    { name: "Bahrom Mirzoyev", type: "manager", email: "bahrom@mgmt.tj", phone: "+992501234567", company: "BM Management", country: "TJ" },
    { name: "Anna Schneider", type: "partner", email: "anna@eu-dist.com", company: "EU Distribution GmbH", country: "DE" },
    { name: "Ivan Petrov", type: "label", email: "ivan@ru-music.ru", company: "Russia Music Group", country: "RU" },
    { name: "Sara Johnson", type: "partner", email: "sara@spotify.com", company: "Spotify", country: "US" },
  ]);
  console.log("Contacts seeded");

  await db.insert(crmTasksTable).values([
    { title: "Review release metadata for Khuroson", status: "in_progress", priority: "high", dueDate: "2024-11-15", description: "Check all metadata fields before delivery to Spotify" },
    { title: "Follow up with EU Distribution partner", status: "todo", priority: "medium", dueDate: "2024-11-20", description: "Discuss Q1 2025 distribution deals" },
    { title: "Set up publishing rights for Bahor album", status: "done", priority: "high", description: "Register with ASCAP and Songtrust" },
    { title: "Prepare payout reports for Q3", status: "todo", priority: "urgent", dueDate: "2024-11-30", description: "Generate and verify all Q3 payout statements" },
    { title: "Onboard Parviz Nazarov to the platform", status: "in_progress", priority: "medium", description: "Set up artist portal access and upload contract" },
  ]);
  console.log("CRM Tasks seeded");

  await db.insert(transactionsTable).values([
    { type: "dsp_revenue", amount: "12450.50", currency: "USD", artistId: artist1.id, labelId: label1.id, platform: "Spotify", description: "Q3 2024 Spotify royalties", period: "2024-Q3" },
    { type: "dsp_revenue", amount: "8320.00", currency: "USD", artistId: artist2.id, labelId: label1.id, platform: "Apple Music", description: "Q3 2024 Apple Music royalties", period: "2024-Q3" },
    { type: "publishing_revenue", amount: "2100.75", currency: "USD", artistId: artist1.id, platform: "ASCAP", description: "Q3 2024 ASCAP performance royalties", period: "2024-Q3" },
    { type: "dsp_revenue", amount: "4560.00", currency: "USD", artistId: artist3.id, labelId: label2.id, platform: "YouTube Music", description: "Q3 2024 YouTube royalties", period: "2024-Q3" },
    { type: "payout", amount: "-5000.00", currency: "USD", artistId: artist1.id, description: "Q3 payout to Daler Nazarov", period: "2024-Q3" },
    { type: "dsp_revenue", amount: "3210.00", currency: "USD", artistId: artist4.id, labelId: label2.id, platform: "Yandex Music", description: "Q3 2024 Yandex Music royalties", period: "2024-Q3" },
    { type: "content_id", amount: "1850.25", currency: "USD", artistId: artist2.id, platform: "YouTube", description: "Content ID revenue Q3", period: "2024-Q3" },
  ]);
  console.log("Transactions seeded");

  await db.insert(deliveriesTable).values([
    { releaseId: release1.id, target: "spotify", status: "delivered", ddexVersion: "4.0", deliveredAt: new Date("2024-03-15"), acknowledgedAt: new Date("2024-03-16") },
    { releaseId: release1.id, target: "apple", status: "delivered", ddexVersion: "4.0", deliveredAt: new Date("2024-03-15"), acknowledgedAt: new Date("2024-03-17") },
    { releaseId: release1.id, target: "yandex", status: "delivered", ddexVersion: "4.0", deliveredAt: new Date("2024-03-20") },
    { releaseId: release2.id, target: "spotify", status: "in_progress", ddexVersion: "4.0" },
    { releaseId: release2.id, target: "yandex", status: "pending", ddexVersion: "4.0" },
    { releaseId: release3.id, target: "apple", status: "failed", errorMessage: "Invalid ISRC format", ddexVersion: "4.0" },
    { releaseId: release5.id, target: "spotify", status: "pending", ddexVersion: "4.0" },
  ]);
  console.log("Deliveries seeded");

  await db.insert(activityLogTable).values([
    { type: "release_created", title: "New Release Created", description: "Album 'Bahor' was created by Daler Nazarov", entityType: "release", entityId: release1.id },
    { type: "release_status_changed", title: "Release Delivered", description: "Album 'Bahor' successfully delivered to Spotify", entityType: "release", entityId: release1.id },
    { type: "artist_updated", title: "Artist Profile Updated", description: "Manija updated her artist bio and social links", entityType: "artist", entityId: artist2.id },
    { type: "payout_requested", title: "Payout Requested", description: "Daler Nazarov requested payout of $5,000 USD", entityType: "payout", entityId: 1 },
    { type: "release_created", title: "New Release Created", description: "EP 'Dushanbe Night' submitted for review", entityType: "release", entityId: release3.id },
    { type: "delivery_failed", title: "Delivery Failed", description: "Delivery of 'Dushanbe Night' to Apple Music failed: Invalid ISRC format", entityType: "delivery", entityId: 6 },
    { type: "track_added", title: "Track Added", description: "Track 'Kuchabo' added to Street Stories album", entityType: "track", entityId: 5 },
  ]);
  console.log("Activity log seeded");

  await db.insert(publishingWorksTable).values([
    { title: "Bahor (Spring)", iswc: "T-123456789-0", isrc: "TJSND24001001", trackId: 1, status: "registered", writers: [{ name: "Daler Nazarov", role: "composer", share: 100, caeIpi: "00123456789" }], publisher: "Tajik Sounds Publishing", territory: ["WW"], registeredWith: ["ascap", "songtrust"], ascap: true, songtrust: true },
    { title: "Khuroson", iswc: "T-987654321-0", isrc: "TJSND24002001", status: "pending", writers: [{ name: "Manija", role: "composer", share: 60 }, { name: "Kamol Baxtiyorov", role: "lyricist", share: 40 }], publisher: "Tajik Sounds Publishing", territory: ["WW"], registeredWith: [], bmi: false },
    { title: "Dar Dil", status: "draft", writers: [{ name: "Daler Nazarov", role: "composer", share: 100 }], publisher: "Tajik Sounds Publishing", territory: ["WW"], registeredWith: [] },
  ]);
  console.log("Publishing works seeded");

  await db.insert(payoutsTable).values([
    { artistId: artist1.id, amount: "5000.00", currency: "USD", method: "bank_transfer", status: "paid", paymentDetails: "TJ Bank *4521", processedAt: new Date("2024-10-05") },
    { artistId: artist2.id, amount: "3200.00", currency: "USD", method: "paypal", status: "pending", paymentDetails: "manija@paypal.com" },
    { artistId: artist3.id, amount: "1800.00", currency: "USD", method: "wire_transfer", status: "approved", paymentDetails: "IBAN TJ01234567890" },
    { artistId: artist4.id, amount: "950.00", currency: "USD", method: "paypal", status: "rejected", paymentDetails: "parviz@gmail.com", rejectionReason: "Account verification pending", processedAt: new Date("2024-10-12") },
  ]);
  console.log("Payouts seeded");

  await db.insert(splitsTable).values([
    { releaseId: release1.id, participants: [{ entityType: "artist", entityId: artist1.id, entityName: "Daler Nazarov", percentage: 70 }, { entityType: "label", entityId: label1.id, entityName: "Tajik Sounds Records", percentage: 30 }] },
    { releaseId: release2.id, participants: [{ entityType: "artist", entityId: artist2.id, entityName: "Manija", percentage: 60 }, { entityType: "label", entityId: label1.id, entityName: "Tajik Sounds Records", percentage: 25 }, { entityType: "user", entityId: 2, entityName: "Producer", percentage: 15 }] },
    { trackId: 3, participants: [{ entityType: "artist", entityId: artist2.id, entityName: "Manija", percentage: 50 }, { entityType: "user", entityId: 2, entityName: "Kamol Baxtiyorov", percentage: 50 }] },
  ]);
  console.log("Splits seeded");

  console.log("\nSeed complete!");
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
