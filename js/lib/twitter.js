const TWITTER_API_URL         = 'https://api.twitter.com/';
const TWITTER_CONSUMER_KEY    = '9Y6TkkJkq65aBTi07ozaNYgP7';
const TWITTER_CONSUMER_SECRET = 'NhVLcbe4WD2rGUHxRUsdhCvLFIkjqWHqrkFIIYQ0sXV5Zo4R7w';

// Manage the authentication flow and authenticated requests
// against the Twitter API.
class TwitterClient {
  constructor() {
    this.api_url         = TWITTER_API_URL;
    this.consumer_key    = TWITTER_CONSUMER_KEY;
    this.consumer_secret = TWITTER_CONSUMER_SECRET;
    this.credentials = new TwitterCredentials();

    this.resolveAuthentication = null;
    this.rejectAuthentication = null;
  }

  // Initialize the client by loading saved Twitter credentials.
  // Returns a promise that will be resolved with the Twitter username if found,
  // and rejected otherwise.
  loadCredentials() {
    return TwitterCredentials.load()
    .then((credentials) => {
      this.credentials = credentials;
      return credentials.screen_name;
    });
  }

  // Ensure the user is authenticated.
  // If yes, quickly returns a resolved Promise.
  // If no, start the OAuth flow, and return a promise that will resolve at the end of the flow.
  authenticate() {
    return this.loadCredentials()
    .catch(() => {
      return this._startAuthentication();
    });
  }

  // Finish the last authentication step, by providing the query parameters
  // sent by Twitter to the callback pop-up page.
  //
  // This method is intended to be called from the background extension page.
  // It will send a message to the content page, in order to resolves (or reject)
  // the promise returned by `authenticate`.
  completeAuthentication(queryParams) {
    var params = this._deparam(queryParams);

    this.api('oauth/access_token', 'POST', params)
    .then(response => response.text())
    .then((responseText) => {
      this.credentials = new TwitterCredentials(this._deparam(responseText));
      return this.credentials.save();
    })
    .then(() => {
      this._sendMessageToContentPage({ authState: 'success' });
    })
    .catch((error) => {
      this._sendMessageToContentPage({ authState: 'failure', error: error });
    });
  }

  // Send a request to the Twitter API.
  // Returns a promise that resolves when the request finishes.
  api(path /*, method, params */) {
    var args = Array.prototype.slice.call(arguments, 1),
        params = {},
        method = 'GET';

    /* Parse arguments to their appropriate position */
    for(var i in args) {
      switch(typeof args[i]) {
        case 'object':
          params = args[i];
        break;
        case 'string':
          method = args[i].toUpperCase();
        break;
      }
    }

    /* Add an oauth token if it is an api request */
    params.oauth_token = params.oauth_token || this.credentials.oauth_token;

    /* Add a 1.1 and .json if its not an authentication request */
    (!path.match(/oauth/)) && (path = '1.1/' + path + '.json');

    var accessor = {consumerSecret: this.consumer_secret, tokenSecret: this.credentials.oauth_token_secret},
      message = {
        action: this.api_url + path,
        method: method,
        parameters: [['oauth_consumer_key', this.consumer_key], ['oauth_signature_method', 'HMAC-SHA1']]
      };

    Object.entries(params).forEach(([key, value]) => {
      OAuth.setParameter(message, key, value);
    });

    OAuth.completeRequest(message, accessor);

    var requestParams = new URLSearchParams();
    Object.entries(OAuth.getParameterMap(message.parameters)).forEach(([key, value]) => {
      if (value == null) {
        value = '';
      }
      requestParams.append(key, value);
    });

    return fetch(this.api_url + path, { method: method, body: requestParams })
      .catch((response) => {
        if(res && res.responseText && res.responseText.match(/89/)) {
          this._startAuthentication();
        }
      });
  }

  // Clear user credentials.
  // Returns a promise that will resolve then the credentials have been removed from the persistent store
  logout() {
    return this._clearCredentials();
  }

  /* Private methods */

  _clearCredentials() {
    this.credentials = new TwitterCredentials();
    return this.credentials.save();
  }

  // Convert a query string into an key-value object
  _deparam(responseText) {
    let obj = {};
    responseText.split('&').forEach((param) => {
      let pair = param.split('=');
      obj[pair[0]] = pair[1];
    });
    return obj;
  }

  _startAuthentication() {
    return this._clearCredentials()
    .then(() => this.api('oauth/request_token', 'POST'))
    .then(response => response.text())
    .then((responseText) => {
      // Extract request token
      let credentials = new TwitterCredentials(this._deparam(responseText));
      // Open a pop-up window to start the OAuth flow
      var url = 'https://api.twitter.com/oauth/authenticate?oauth_token=' + credentials.oauth_token;
      window.open(url);
      // Listen for messages sent by the background page
      chrome.runtime.onMessage.addListener(this._didReceiveMessage.bind(this));
      // Return a promise that will be resolved (or rejected) when the callback URL is called
      let oauthPromise = new Promise((resolve, reject) => {
        this.resolveAuthentication = resolve;
        this.rejectAuthentication = reject;
      });
      return oauthPromise;
    });
  }

  _sendMessageToContentPage(messageObject) {
    chrome.tabs.query({}, function(tabs) {
      for (let tab of tabs) {
        console.debug(`Sending message to tab ${tab.id}`);
        chrome.tabs.sendMessage(tab.id, messageObject, function() {});
      }
    });
  }

  _didReceiveMessage(request, sender, sendResponse) {
    console.debug("Received message: " + JSON.stringify(request));
    
    if (request.authState == 'success') {
      this.loadCredentials()
      .catch(error => this.rejectAuthentication(error))
      .then((screen_name) => {
        this.resolveAuthentication(screen_name);
        this.resolveAuthentication = null;
        this.rejectAuthentication = null;
      });

    } else if (request.authState == 'failure') {
      this.rejectAuthentication(request.error);
      this.resolveAuthentication = null;
      this.rejectAuthentication = null;
    }
  }
}

// Represents, save and retrieve Twitter user credentials from local storage.
// For internal use only.
class TwitterCredentials {
  constructor(credentials) {
    credentials = credentials || {};

    this.oauth_token = credentials.oauth_token || null;
    this.oauth_token_secret = credentials.oauth_token_secret || null;
    this.screen_name = credentials.screen_name || null;
  }

  static load() {
    return TwitterCredentials._chromeLocalStorageGet(['oauth_token', 'oauth_token_secret', 'screen_name'])
    .then((result) => {
      let isValid = result.oauth_token && result.oauth_token_secret && result.screen_name;
      if (isValid) {
        return new TwitterCredentials(result);
      } else {
        throw new Error('No valid Twitter credentials found in local storage');
      }
    });
  }

  save() {
    return TwitterCredentials._chromeLocalStorageSet({
      oauth_token:        this.oauth_token,
      oauth_token_secret: this.oauth_token_secret,
      screen_name:        this.screen_name
    });
  }

  // Promise wrapper for chrome.storage.local.get
  static _chromeLocalStorageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (results) => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); }
        else { resolve(results); }
      });
    });
  }

  // Promise wrapper for chrome.storage.local.set
  static _chromeLocalStorageSet(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); }
        else { resolve(); }
      });
    });
  }
}
