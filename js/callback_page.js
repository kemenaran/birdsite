/**
 * This script is injected into the callback page where the Twitter authentication
 * redirects the user at the end of the flow.
 *
 * The URL query params contains the generated access tokens.
 */

// Pass the query params to the background extension page
let message = {
  type: 'auth',
  queryParams: window.location.search.substr(1)
};

// TODO: can we maybe skip the background page, and
// send the message directly to the tab running the extension?
chrome.runtime.sendMessage(message, function(response) {
  // Now that the message has been received, close the pop-up window.
	window.open('', '_self', '');
	window.close();
});
