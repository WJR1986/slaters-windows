const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK.
admin.initializeApp();
const db = admin.firestore();

// --- CONFIGURATION ---
// SET THE EMAIL ADDRESS WHERE YOU WANT TO RECEIVE THE DAILY SUMMARY.
const CENTRAL_EMAIL_ADDRESS = "willrichardson182@gmail.com";


/**
 * A scheduled Cloud Function that runs every day at 8:00 AM.
 * It gathers all due follow-ups from all users and sends a single
 * summary email to the central email address specified above.
 */
exports.dailyEmailCheck = functions.pubsub.schedule("every day 08:00")
  .onRun(async (context) => {
    console.log("Running daily check for all due follow-ups.");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split("T")[0]; // Format as "YYYY-MM-DD"

    // This array will hold all due items from all users.
    let allDueFollowUps = [];

    try {
      // Get all documents from the 'users' collection.
      const usersSnapshot = await db.collection("users").get();

      // Process each user to find their due items.
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userEmail = userData.email; // The worker's email.
        const customers = userData.customers || [];

        if (!userEmail) {
          console.log(`Skipping user ${userDoc.id}: no email found.`);
          continue;
        }

        // Find customers due today for this specific user.
        const dueToday = customers.filter(customer => customer.dueDate === todayISO);

        if (dueToday.length > 0) {
          // Add the worker's email to each due item for context in the summary.
          const dueItemsWithUser = dueToday.map(customer => ({
            ...customer,
            workerEmail: userEmail
          }));
          // Add these items to the main list.
          allDueFollowUps = allDueFollowUps.concat(dueItemsWithUser);
        }
      }

      // After checking all users, if there's anything due, send one email.
      if (allDueFollowUps.length > 0) {
        console.log(`Found a total of ${allDueFollowUps.length} due follow-ups. Creating summary email.`);

        // Create an HTML list that includes the worker for each task.
        const customerListHtml = allDueFollowUps
          .map(c => `<li><b>${c.name}</b> at ${c.address} (Assigned to: ${c.workerEmail})</li>`)
          .join("");

        // Create the email document for the "Trigger Email" extension to process.
        await db.collection("mail").add({
          to: CENTRAL_EMAIL_ADDRESS,
          message: {
            subject: `Daily Summary: ${allDueFollowUps.length} follow-up(s) due today`,
            html: `
              <div style="font-family: sans-serif; font-size: 16px;">
                <p>Hello,</p>
                <p>This is the daily summary of all follow-ups that are due today:</p>
                <ul>
                  ${customerListHtml}
                </ul>
                <p>Please ensure these are followed up on.</p>
              </div>
            `,
          },
        });
      } else {
        console.log("No follow-ups due today across all users.");
      }

      console.log("Daily email check completed.");

    } catch (error) {
      console.error("Error running daily email check:", error);
    }
  });

