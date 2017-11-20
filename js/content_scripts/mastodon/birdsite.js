const TWITTER_BIRDSITE_CONSUMER_KEY    = '9Y6TkkJkq65aBTi07ozaNYgP7';
const TWITTER_BIRDSITE_CONSUMER_SECRET = 'NhVLcbe4WD2rGUHxRUsdhCvLFIkjqWHqrkFIIYQ0sXV5Zo4R7w';

// The main class driving the extension in the Mastodon web app.
class BirdSite {
  constructor() {
    this.twitterClient = new TwitterClient(TWITTER_BIRDSITE_CONSUMER_KEY, TWITTER_BIRDSITE_CONSUMER_SECRET);
    this.mastodonClient = new MastodonClient();
    this.store = new BirdSiteStore();
    // Will be initialized on injection
    this.birdSiteUI = null;
    this.mastodonInstance = null;
    this.mastodonUsername = null;
  }

  initialize() {
    // Normally this script is injected by the background extension script only
    // if the page runs the Mastodon web app.
    // But another check never hurts.
    let mastodonWebAppRoot = document.querySelector('.app-holder#mastodon');
    if (!mastodonWebAppRoot) {
      console.warn('BirdSite: Mastodon web app was initially detected, but cannot be found after script injection. Aborting.');
      return;
    }

    let mastodonComposeForm = document.querySelector('div#mastodon .compose-form');
    if (mastodonComposeForm) {
      this._inject();

    } else {
      // Set up a mutation observer, to detect when the compose form may be visible.
      //
      // To make the observer as lightweight as possible, instead of observing every
      // mutation of the whole DOM tree, we only look for the `is-composing` class
      // added to a root div when the compose form gains focus.
      //
      // See https://stackoverflow.com/questions/31659567/performance-of-mutationobserver-to-detect-nodes-in-entire-dom
      let uiContainer = mastodonWebAppRoot.querySelector('div.ui');
      let observer = new MutationObserver((/* mutations */) => {
        let isComposeFormFocused = uiContainer.classList.contains('is-composing');
        if (isComposeFormFocused) {
          this._inject();
          // When displaying the mobile web UI, the compose form may be removed and
          // then made visible again.
          // Keep the observer active, so that we can re-attach our custom UI
          // if this happens.
        }
      });
      observer.observe(uiContainer, { attributes: true, attributeFilter: ['class'] });
    }
  }

  async _inject() {
    console.debug('Mastodon compose form detected: loading BirdSite extension UI');
    let composeForm = document.querySelector('div#mastodon .compose-form');
    if (!composeForm) {
      console.warning('BirdSite: couldn’t inject the UI: Mastodon compose form was not found.');
      return;
    }

    this.birdSiteUI = new BirdSiteUI(composeForm, {
      toggle: this.toggleCheckboxAction.bind(this),
      send:   this.crossPostToTwitterAction.bind(this),
      logout: this.logoutAction.bind(this)
    });

    let username = await this.twitterClient.loadCredentials();
    if (username) {
      this.store.transitionToSignedIn(username);
      this.birdSiteUI.render(this.store.state);

    } else {
      this.store.transitionToSignedOut();
      this.birdSiteUI.render(this.store.state);
    }

    this.mastodonInstance = document.location.hostname,
    this.mastodonUsername = document.querySelector('.navigation-bar__profile-account').textContent.replace(/@/, '');
  }

  // Actions

  toggleCheckboxAction(checked) {
    this.store.toggleChecked(checked);
    this.birdSiteUI.render(this.store.state);
  }

  async crossPostToTwitterAction(toot) {
    try {
      let hasCredentials = await this.twitterClient.loadCredentials();
      if (!hasCredentials) {
        this.store.transitionToAuthenticating();
        this.birdSiteUI.render(this.store.state);
        
        let username = await this.twitterClient.authenticate();

        this.store.transitionToSignedIn(username);
        this.birdSiteUI.render(this.store.state);
      }

      this.store.transitionToPosting();
      this.birdSiteUI.render(this.store.state);

      let tweet = new Tweet(toot);
      if (tweet.needsTruncation() || tweet.hasPattern(this.mediaUrlRegexp)) {
        let status = await this.mastodonClient.fetchStatusForToot(this.mastodonInstance, this.mastodonUsername, toot);
        tweet.setExternalUrl(status['url']);
        status['media_attachments'].forEach(media_attachment => tweet.addMedia(media_attachment.url));
        tweet.deletePattern(this.mediaUrlRegexp);
      }

      await this.twitterClient.sendTweet(tweet);
      this.store.transitionToSuccess();
      this.birdSiteUI.render(this.store.state);

    } catch (error) {
      this.store.transitionToFailure(error);
      this.birdSiteUI.render(this.store.state);
      console.error(error);
    }
  }

  logoutAction() {
    this.twitterClient.logout();

    this.store.transitionToSignedOut();
    this.birdSiteUI.render(this.store.state);
  }

  // Helpers

  get mediaUrlRegexp() {
    let mediaUrl = `[ ]?https://mastodon.xyz/media/[^ ]*`,
        escapedMediaUrl = mediaUrl.replace(/\//, '\/');
    return new RegExp(escapedMediaUrl, 'g');
  }
}

// A state machine for representing the extension UI state.
class BirdSiteStore {
  constructor() {
    this.state = {
      uiState:      UIState.SIGNED_OUT,
      username:     null,
      checked:      false,
      errorMessage: null
    };
  }

  transitionToAuthenticating() {
    this.state.uiState  = UIState.AUTHENTICATING;
    this.state.username = null;
    this.errorMessage   = null;
  }

  transitionToSignedIn(username) {
    this.state.uiState  = UIState.READY;
    this.state.username = username;
    this.errorMessage   = null;
  }

  transitionToSignedOut() {
    this.state.uiState  = UIState.SIGNED_OUT;
    this.state.username = null;
    this.errorMessage   = null;
  }

  transitionToPosting() {
    this.state.uiState = UIState.POSTING;
    this.state.checked = true;
    this.errorMessage  = null;
  }

  transitionToSuccess() {
    this.state.uiState = UIState.SUCCESS;
    this.state.checked = false;
    this.errorMessage  = null;
  }

  transitionToFailure(error) {
    this.state.uiState = UIState.FAILURE;
    this.state.checked = false;
    this.state.errorMessage = (error && error.toString() || null);
  }

  toggleChecked(isChecked) {
    this.state.checked = !!isChecked;
    if (this.state.uiState == UIState.SUCCESS || this.state.uiState == UIState.FAILURE) {
      this.transitionToSignedIn(this.state.username);
    }
  }
}

// Inject the UI into the Mastodon web app
let birdSite = new BirdSite();
birdSite.initialize();
