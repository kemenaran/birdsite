/**
 * This script is run into the extension permanent page.
 * It receives messages from the content web pages, and reacts accordingly.
 */

function injectContentScript(request, sender, response) {
  chrome.tabs.executeScript({ file: "/js/lib/sha1.js" }, function() {
    chrome.tabs.executeScript({ file: "/js/lib/oauth.js" }, function() {
      chrome.tabs.executeScript({ file: "/js/lib/twitter.js" }, function() {
        chrome.tabs.executeScript({ file: "/js/content_scripts/mastodon/birdsite_ui.js" }, function() {
          chrome.tabs.executeScript({ file: "/js/content_scripts/mastodon/birdsite.js" }, function() {});
        });
      });
    });
  });
}

function authenticationCallback(request, sender, sendResponse) {
  let twitterClient = new TwitterClient();
  twitterClient.completeAuthentication(request.queryParams);
}

// Register a listener for messages sent by the content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type == 'inject_content_script') {
    injectContentScript(request, sender, sendResponse);

  } else if (request.type == 'authentication_callback') {
    authenticationCallback(request, sender, sendResponse);

  } else {
    console.warning(`Unhandled message (${JSON.stringify(request)})`);
  }
});

