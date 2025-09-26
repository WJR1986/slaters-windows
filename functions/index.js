const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK.
admin.initializeApp();
const db = admin.firestore();

// --- CONFIGURATION ---
// SET THE EMAIL ADDRESS WHERE YOU WANT TO RECEIVE THE DAILY SUMMARY.
const CENTRAL_EMAIL_ADDRESS = "your-central-email@example.com";


/**
 * An on-demand (callable) Cloud Function that can be triggered from the web app.
 * It gathers all currently OVERDUE follow-ups from all users and sends a single
 * summary email to the central email address.
 */
exports.sendOverdueSummary = functions.https.onCall(async (data, context) => {
  // 1. Check for authentication to ensure only logged-in users can run this.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to request an overdue report."
    );
  }

  console.log(`Overdue report requested by: ${context.auth.token.email}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to the beginning of today for comparison.

  // This array will hold all overdue items from all users.
  let allOverdueFollowUps = [];

  try {
    // 2. Get all documents from the 'users' collection.
    const usersSnapshot = await db.collection("users").get();

    // 3. Process each user to find their overdue items.
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userEmail = userData.email;
      const customers = userData.customers || [];

      if (!userEmail) continue;

      // Find customers with a due date *before* today.
      const overdue = customers.filter(customer => new Date(customer.dueDate) < today);

      if (overdue.length > 0) {
        const overdueItemsWithUser = overdue.map(customer => ({
          ...customer,
          workerEmail: userEmail
        }));
        allOverdueFollowUps = allOverdueFollowUps.concat(overdueItemsWithUser);
      }
    }

    // 4. If any overdue items were found, send the summary email.
    if (allOverdueFollowUps.length > 0) {
      console.log(`Found a total of ${allOverdueFollowUps.length} overdue follow-ups. Creating summary email.`);

      // Sort by due date, oldest first, for clarity in the email.
      allOverdueFollowUps.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

      const customerListHtml = allOverdueFollowUps
        .map(c => {
          const formattedDate = new Date(c.dueDate).toLocaleDateString("en-GB");
          return `<li><b>${c.name}</b> at ${c.address} (Assigned to: ${c.workerEmail}, Due: ${formattedDate})</li>`
        })
        .join("");

      // Create the email document for the "Trigger Email" extension to process.
      await db.collection("mail").add({
        to: CENTRAL_EMAIL_ADDRESS,
        message: {
          subject: `On-Demand Report: ${allOverdueFollowUps.length} Overdue Follow-up(s)`,
          html: `
            <div style="font-family: sans-serif; font-size: 16px;">
              <p>Hello,</p>
              <p>Here is the requested report of all follow-ups that are currently overdue:</p>
              <ul>
                ${customerListHtml}
              </ul>
            </div>
          `,
        },
      });

      // 5. Return a success message to the app.
      return { success: true, message: `Report sent for ${allOverdueFollowUps.length} overdue item(s).` };
    } else {
      console.log("No overdue follow-ups found across all users.");
      return { success: true, message: "No overdue items found to report." };
    }
  } catch (error) {
    console.error("Error generating overdue report:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An error occurred while generating the report."
    );
  }
});

