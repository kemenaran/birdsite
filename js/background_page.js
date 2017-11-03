/**
 * This script is injected into the extension permanent page.
 *
 * It receives the access tokens from the callback page at the end of the authentication flow,
 * and ensures they are valid by regenerating them against the Twitter API.
 */

// Register a listener for messages sent by callback_page.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  sendResponse({});
  
  let twitterClient = new TwitterClient();
  twitterClient.completeAuthentication(request.queryParams);
});
