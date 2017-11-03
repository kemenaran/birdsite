/**
 * This script is run into the extension permanent page.
 * It receives messages from the content web pages, and reacts accordingly.
 */

function injectContentScripts(request, sender, response) {
  chrome.tabs.insertCSS({ file: "/css/birdsite.css", runAt:'document_start'}, function() {
    chrome.tabs.executeScript({ file: "/js/lib/sha1.js", runAt: 'document_start' }, function() {
      chrome.tabs.executeScript({ file: "/js/lib/oauth.js", runAt: 'document_start' }, function() {
        chrome.tabs.executeScript({ file: "/js/lib/twitter.js", runAt: 'document_start' }, function() {
          chrome.tabs.executeScript({ file: "/js/content_scripts/mastodon/birdsite_ui.js", runAt: 'document_start' }, function() {
            chrome.tabs.executeScript({ file: "/js/content_scripts/mastodon/birdsite.js", runAt: 'document_start' }, function() {});
          });
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
  if (request.type == 'inject_content_scripts') {
    injectContentScripts(request, sender, sendResponse);

  } else if (request.type == 'authentication_callback') {
    authenticationCallback(request, sender, sendResponse);

  } else {
    console.warning(`Unhandled message (${JSON.stringify(request)})`);
  }
});

