import dotenv from "dotenv";

dotenv.config();

async function testSendEmail() {
  console.log("Testing email sending functionality...\n");
  
  // Test parameters - update these with your test values
  const testEmail = "test@example.com"; // Change this to your test email
  const testRequest = "requesting a test of the email automation feature";
  
  try {
    // Check if helper service is running
    const healthResponse = await fetch("http://localhost:5185/health");
    if (!healthResponse.ok) {
      console.error("❌ Helper service is not running. Please start it first with 'npm start' in the helper directory.");
      return;
    }
    
    console.log("✅ Helper service is running");
    
    // Test the email sending
    console.log(`\n📧 Sending test email to: ${testEmail}`);
    console.log(`📝 Request: ${testRequest}\n`);
    
    const response = await fetch("http://localhost:5185/invoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: `Send an email to ${testEmail} ${testRequest}`,
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log("✅ Email sent successfully!");
      console.log("Result:", result.result);
    } else {
      console.error("❌ Failed to send email:", result.error);
      if (result.needsLogin) {
        console.log("\n💡 Tip: You need to log into Gmail first. Use the extension to log into Google.");
      }
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Run the test
testSendEmail(); 