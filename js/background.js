/**
 * This script is injected into the extension permanent page.
 *
 * It receives the access tokens from the callback page at the end of the authentication flow,
 * and ensures they are valid by regenerating them against the Twitter API.
 */

// Register a listener for messages sent by callback_page.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  sendResponse({});

  // Deserialize the callback URL query params
  var params = Twitter.deparam(request.session);

  // Get access tokens again
  Twitter.api('oauth/access_token', 'POST', params, function(res) {
    // Persist the tokens to local storage
    Twitter.setOAuthTokens(Twitter.deparam(res), function() {});
  });
});
