const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const storage = getStorage();

/**
 * This function deletes soft-deleted files from Firestore and Cloud Storage
 * after 30 days. It runs daily.
 */
exports.deleteOldSoftDeletedFiles = onSchedule("0 0 * * *", async (event) => {
    logger.info("Running daily cleanup of soft-deleted files.");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const querySnapshot = await db
        .collection("files")
        .where("deleted", "==", true)
        .where("timestamp", "<", thirtyDaysAgo)
        .limit(450) // Limit to 450 to stay safely within Firestore batch limit of 500
        .get();

    const batch = db.batch();
    const deleteFilePromises = [];

    querySnapshot.docs.forEach((doc) => {
        const file = doc.data();
        const storagePath = file.storagePath;

        // Delete from Cloud Storage
        if (storagePath) {
            const bucket = storage.bucket();
            const fileRef = bucket.file(storagePath);
            deleteFilePromises.push(
                fileRef.delete().then(() => {
                    logger.info(`Deleted file from storage: ${storagePath}`);
                }).catch(err => {
                    logger.error(`Failed to delete file from storage: ${storagePath}`, err);
                })
            );
        }

        // Delete from Firestore
        batch.delete(doc.ref);
        logger.info(`Deleting file from Firestore: ${doc.id}`);

        // Decrement storage usage on the project document
        if (file.projectId && file.size) {
            const projectRef = db.collection("projects").doc(file.projectId);
            batch.update(projectRef, { storageUsage: FieldValue.increment(-file.size) });
        }
    });

    await Promise.all(deleteFilePromises);

    try {
        await batch.commit();
        logger.info("Successfully completed cleanup of soft-deleted files.");
    } catch (error) {
        logger.error("Failed to commit batch delete", error);
    }
});


// Existing Function
// exports.sendContactEmail = onDocumentCreated...