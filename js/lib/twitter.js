(function() {
  var API_URL         = 'https://api.twitter.com/';
  var consumer_key    = '9Y6TkkJkq65aBTi07ozaNYgP7';
  var consumer_secret = 'NhVLcbe4WD2rGUHxRUsdhCvLFIkjqWHqrkFIIYQ0sXV5Zo4R7w';
  var Twitter = {
    oauth_token: null,
    oauth_token_secret: null,
    screen_name: null,

    resolveAuthentication: null,
    rejectAuthentication: null,

    // Load saved Twitter credentials.
    // Returns a promise that will be resolved with the credentials if found,
    // and rejected otherwise.
    loadCredentials: function() {
      return this._fetchStoredCredentials()
      .then((credentials) => {
        let isLoggedIn = credentials.oauth_token && credentials.oauth_token_secret && credentials.screen_name;
        if (isLoggedIn) {
          this._setCredentials(credentials);
          return credentials.screen_name;
        } else {
          throw new Error('No Twitter API credentials found');
        }
      });
    },

    // Ensure the user is authenticated.
    // If yes, quickly returns a resolved Promise.
    // If no, start the OAuth flow, and return a promise that will resolve at the end of the flow.
    authenticate: function() {
      return this.loadCredentials()
      .catch(() => {
        return this._startAuthentication();
      });
    },

    // Finish the last authentication step, by providing the query parameters
    // sent by Twitter to the callback pop-up page.
    //
    // This method is intended to be called from the background extension page.
    // It will send a message to the content page, in order to resolves (or reject)
    // the promise returned by `authenticate`.
    completeAuthentication: function(queryParams) {
      var params = this._deparam(queryParams);

      this.api('oauth/access_token', 'POST', params)
      .then(response => response.text())
      .then((responseText) => {
        return this._setCredentials(this._deparam(responseText));
      })
      .then(() => {
        this._sendMessageToContentPage({ authState: 'success' });
      })
      .catch((error) => {
        this._sendMessageToContentPage({ authState: 'failure', error: error });
      });
    },

    // Send a request to the Twitter API.
    // Returns a promise that resolves when the request finishes.
    api: function(path /*, method, params */) {
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
      params.oauth_token = params.oauth_token || Twitter.oauth_token;

      /* Add a 1.1 and .json if its not an authentication request */
      (!path.match(/oauth/)) && (path = '1.1/' + path + '.json');

      var accessor = {consumerSecret: consumer_secret, tokenSecret: Twitter.oauth_token_secret},
        message = {
          action: API_URL + path,
          method: method,
          parameters: [['oauth_consumer_key', consumer_key], ['oauth_signature_method', 'HMAC-SHA1']]
        };

      $.each(params, function(k, v) {
        OAuth.setParameter(message, k, v);
      });

      OAuth.completeRequest(message, accessor);

      var requestParams = new URLSearchParams();
      $.each(OAuth.getParameterMap(message.parameters), function(key, value) {
        if (value == null) {
          value = '';
        }
        requestParams.append(key, value);
      });

      return fetch(API_URL + path, { method: method, body: requestParams })
        .catch((response) => {
          if(res && res.responseText && res.responseText.match(/89/)) {
            Twitter._startAuthentication();
          }
        });
    },

    // Clear user credentials.
    logout: function() {
      this._clearCredentials();
    },

    /* Private methods */

    // Retrieve one or several values in the extension local storage.
    // Returns a promise that will resolve when done.
    _chromeLocalStorageGet: function(keys) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (results) => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); }
          else { resolve(results); }
        });
      });
    },

    // Store an object in the extension local storage.
    // Returns a promise that will resolve when done.
    _chromeLocalStorageSet: function(items) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); }
          else { resolve(); }
        });
      });
    },

    _setCredentials: function(credentials) {
      Twitter.oauth_token        = credentials.oauth_token;
      Twitter.oauth_token_secret = credentials.oauth_token_secret;
      Twitter.screen_name        = credentials.screen_name;
      return this._chromeLocalStorageSet({
        'oauth_token':        credentials.oauth_token,
        'oauth_token_secret': credentials.oauth_token_secret,
        'screen_name':        credentials.screen_name
      });
    },

    _fetchStoredCredentials: function() {
      return this._chromeLocalStorageGet(['oauth_token', 'oauth_token_secret', 'screen_name']);
    },

    _clearCredentials: function() {
      Twitter.oauth_token        = null;
      Twitter.oauth_token_secret = null;
      Twitter.screen_name        = null;
      chrome.storage.local.remove(['oauth_token', 'oauth_token_secret', 'screen_name']);
    },

    // Convert a query string into an key-value object
    _deparam: function(responseText) {
      var obj = {};
      $.each(responseText.split('&'), function() {
        var item = this.split('=');
        obj[item[0]] = item[1];
      });
      return obj;
    },

    _startAuthentication: function() {
      this._clearCredentials();

      return this.api('oauth/request_token', 'POST')
      .then(response => response.text())
      .then((responseText) => {
        // Extract request tokens
        var params = this._deparam(responseText);
        this._setCredentials({
          'oauth_token':        params.oauth_token,
          'oauth_token_secret': params.oauth_token_secret,
          'screen_name':        'foo' // FIXME
        });
        // Open a pop-up window to start the OAuth flow
        var url = 'https://api.twitter.com/oauth/authenticate?oauth_token=' + Twitter.oauth_token;
        window.open(url);
        // Listen for messages sent by the background page
        chrome.runtime.onMessage.addListener(this._didReceiveMessage.bind(this));
        // Return a promise that will be resolved (or rejected) when the callback URL is called
        let oauthPromise = new Promise((resolve, reject) => {
          Twitter.resolveAuthentication = resolve;
          Twitter.rejectAuthentication = reject;
        });
        return oauthPromise;
      });
    },

    _sendMessageToContentPage(messageObject) {
      chrome.tabs.query({ currentWindow: true }, function(tabs) {
        console.debug(`Sending message to tab ${tabs[0].id}`);
        chrome.tabs.sendMessage(tabs[0].id, messageObject, function() {});
      });
    },

    _didReceiveMessage(request, sender, sendResponse) {
      console.debug("Received message: " + JSON.stringify(request));
      
      if (request.authState == 'success') {
        this.loadCredentials()
        .catch(error => Twitter.rejectAuthentication(error))
        .then((screen_name) => {
          Twitter.resolveAuthentication(screen_name);
          Twitter.resolveAuthentication = null;
          Twitter.rejectAuthentication = null;
        });

      } else if (request.authState == 'failure') {
        Twitter.rejectAuthentication(request.error);
        Twitter.resolveAuthentication = null;
        Twitter.rejectAuthentication = null;
      }
    }
  };

  window.Twitter = Twitter;
})();
