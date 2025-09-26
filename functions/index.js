const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK.
admin.initializeApp();
const db = admin.firestore();

/**
 * A scheduled Cloud Function that runs every day at 8:00 AM.
 * It checks for due follow-ups and creates an email document in Firestore,
 * which the "Trigger Email" extension then sends.
 */
exports.dailyEmailCheck = functions.pubsub.schedule("every day 08:00")
  .onRun(async (context) => {
    console.log("Running daily check for due follow-ups.");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split("T")[0]; // Format as "YYYY-MM-DD"

    try {
      // Get all documents from the 'users' collection.
      const usersSnapshot = await db.collection("users").get();

      // Process each user.
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userEmail = userData.email; // The user's login email.
        const customers = userData.customers || [];

        if (!userEmail) {
          console.log(`Skipping user ${userDoc.id}: no email found.`);
          continue;
        }

        // Find customers due today.
        const dueToday = customers.filter(customer => customer.dueDate === todayISO);

        if (dueToday.length > 0) {
          console.log(`Found ${dueToday.length} due follow-ups for ${userEmail}. Creating email document.`);

          // Create the list of customers for the email body.
          const customerListHtml = dueToday
            .map(c => `<li><b>${c.name}</b> at ${c.address}</li>`)
            .join("");

          // This is the new, simplified part. We just add a document to a "mail" collection.
          // The Trigger Email extension will automatically see this and send the email.
          await db.collection("mail").add({
            to: userEmail,
            message: {
              subject: `You have ${dueToday.length} follow-up(s) due today!`,
              html: `
                <div style="font-family: sans-serif; font-size: 16px;">
                  <p>Hello,</p>
                  <p>This is a reminder that the following follow-ups are due today:</p>
                  <ul>
                    ${customerListHtml}
                  </ul>
                  <p>Please open the Follow-up App to take action.</p>
                </div>
              `,
            },
          });
        }
      }
      console.log("Daily email check completed.");

    } catch (error) {
      console.error("Error running daily email check:", error);
    }
  });

