var birdSiteUI, store, twitterClient;

class BirdSiteStore {
  constructor() {
    this.state = {
      uiState:  UIState.SIGNED_OUT,
      username: null,
      checked:  false
    };
  }

  transitionToAuthenticating() {
    this.state.uiState = UIState.AUTHENTICATING;
    this.state.username = null;
  }

  transitionToSignedIn(username) {
    this.state.uiState = UIState.READY;
    this.state.username = username;
  }

  transitionToSignedOut() {
    this.state.uiState = UIState.SIGNED_OUT;
    this.state.username = null;
  }

  transitionToPosting() {
    this.state.uiState = UIState.POSTING;
    this.state.checked = true;
  }

  transitionToSuccess() {
    this.state.uiState = UIState.SUCCESS;
    this.state.checked = false;
  }

  transitionToFailure() {
    this.state.uiState = UIState.FAILURE;
    this.state.checked = false;
  }

  toggleChecked(isChecked) {
    this.state.checked = !!isChecked;
    if (this.state.uiState == UIState.SUCCESS || this.state.uiState == UIState.FAILURE) {
      this.transitionToSignedIn(this.state.username);
    }
  }
}

/** Injected extension code **********************************/

detect();

function detect() {
  // Normally this script is injected by the background extension script only
  // if the page runs the Mastodon web app.
  // But another check never hurts.
  let mastodonWebAppRoot = document.querySelector('.app-holder#mastodon');
  if (!mastodonWebAppRoot) {
    return;
  }

  let mastodonComposeForm = document.querySelector('div#mastodon .compose-form');
  if (mastodonComposeForm) {
    inject();

  } else {
    // Set up a mutation observer, to detect when the compose form may be visible.
    //
    // To make the observer as lightweight as possible, instead of observing every
    // mutation of the whole DOM tree, we only look for the `is-composing` class
    // added to a root div when the compose form gains focus.
    //
    // See https://stackoverflow.com/questions/31659567/performance-of-mutationobserver-to-detect-nodes-in-entire-dom
    let uiContainer = mastodonWebAppRoot.querySelector('div.ui');
    let observer = new MutationObserver(function (/* mutations */) {
      let isComposeFormFocused = uiContainer.classList.contains('is-composing');
      if (isComposeFormFocused) {
        inject();
        // When displaying the mobile web UI, the compose form may be removed and
        // then made visible again.
        // Keep the observer active, so that we can re-attach our custom UI
        // if this happens.
      }
    });
    observer.observe(uiContainer, { attributes: true, attributeFilter: ['class'] });
  }
}

async function inject() {
  console.debug('Mastodon compose form detected: loading BirdSite extension UI');
  let composeForm = document.querySelector('div#mastodon .compose-form');
  if (!composeForm) {
    console.warning('Couldn’t setup BirdSite extension for Mastodon web app: the compose form was not found.');
    return;
  }

  twitterClient = new TwitterClient();
  store = new BirdSiteStore();
  birdSiteUI = new BirdSiteUI(composeForm, {
    toggle: toggleCheckboxAction,
    send:   crossPostToTwitterAction,
    logout: logoutAction
  });

  try {
    let username = await twitterClient.loadCredentials();
    store.transitionToSignedIn(username);
    birdSiteUI.render(store.state);

  } catch (notLoggedIn) {
    store.transitionToSignedOut();
    birdSiteUI.render(store.state);
  }
}

/** Actions */

function toggleCheckboxAction(checked) {
  store.toggleChecked(checked);
  birdSiteUI.render(store.state);
}

async function crossPostToTwitterAction(message) {
  try {
    try {
      await twitterClient.loadCredentials();
    } catch (notLoggedIn) {
      store.transitionToAuthenticating();
      birdSiteUI.render(store.state);
      
      let username = await twitterClient.authenticate();

      store.transitionToSignedIn(username);
      birdSiteUI.render(store.state);
    }

    store.transitionToPosting();
    birdSiteUI.render(store.state);

    let params = { status: message };
    await twitterClient.api('statuses/update', 'POST', params);
    store.transitionToSuccess();
    birdSiteUI.render(store.state);

  } catch (error) {
    store.transitionToFailure();
    birdSiteUI.render(store.state);
    console.error(error);
    alert('An error occured while posting to the bird site: ' + error);
  }
}

function logoutAction() {
  twitterClient.logout();
  store.transitionToSignedOut();
  birdSiteUI.render(store.state);
}
