var birdSiteUI, store;

/** Store *********************************/

const TwitterState = {
  SIGNED_OUT: 'signed-out',
  AUTHENTICATING: 'authenticating',
  READY: 'ready',
  POSTING: 'posting',
  SUCCESS: 'success',
  FAILURE: 'failure'
};

class BirdSiteStore {
  constructor() {
    this.state = {
      twitterState: TwitterState.SIGNED_OUT,
      username:     null,
      checked:      false
    };
  }

  transitionToAuthenticating() {
    this.state.twitterState = TwitterState.AUTHENTICATING;
    this.state.username = null;
  }

  transitionToSignedIn(username) {
    this.state.twitterState = TwitterState.READY;
    this.state.username = username;
  }

  transitionToSignedOut() {
    this.state.twitterState = TwitterState.SIGNED_OUT;
    this.state.username = null;
  }

  transitionToPosting() {
    this.state.twitterState = TwitterState.POSTING;
    this.state.checked = true;
  }

  transitionToSuccess() {
    this.state.twitterState = TwitterState.SUCCESS;
    this.state.checked = false;
  }

  transitionToFailure() {
    this.state.twitterState = TwitterState.FAILURE;
    this.state.checked = false;
  }

  toggleChecked(isChecked) {
    this.state.checked = !!isChecked;
    if (this.state.twitterState == TwitterState.SUCCESS || this.state.twitterState == TwitterState.FAILURE) {
      this.transitionToSignedIn(this.store.username);
    }
  }
}

/* UI component ***********************************/

class BirdSiteUI {
  constructor(composeForm, actions) {
    this.composeForm = composeForm;
    this.actions = actions;

    let tootButton = document.querySelector('#mastodon .compose-form__publish button');
    tootButton.addEventListener('click', this._tootButtonClicked.bind(this));
  }

  render(model) {
    let state = {
      step:            model.twitterState,
      username:        model.username,
      checked:         model.checked,
      labelText:       null,
      enabled:         false,
      identityVisible: false,
    };

    switch (state.step) {
      case TwitterState.SIGNED_OUT:
        state.labelText = "Also post on bird site";
        state.identityVisible = false;
        state.enabled = true;
        break;
      case TwitterState.AUTHENTICATING:
        state.labelText = "Authenticating…";
        state.identityVisible = false;
        state.enabled = false;
        break;
      case TwitterState.READY:
        state.labelText = "Also post on bird site";
        state.identityVisible = true;
        state.enabled = true;
        break;
      case TwitterState.POSTING:
        state.labelText = "Also post on bird site…";
        state.identityVisible = true;
        state.enabled = false;
        break;
      case TwitterState.SUCCESS:
        state.labelText = "Also post on bird site";
        state.identityVisible = true;
        state.enabled = false;
        break;
      case TwitterState.FAILURE:
        state.labelText = "An error occured while posting to the bird site";
        state.identityVisible = true;
        state.enabled = true;
        break;
    }

    // Render the component
    let html = `
      <div class="tooter tooter--${state.step}" ${state.enabled ? '' : 'disabled'}>
        <label class="tooter__crosspost">
          <input class="tooter__crosspost-checkbox" name="tooter-crosspost-checkbox" type="checkbox" ${state.checked ? 'checked' : ''}>
          <span class="tooter__label-text">
            ${state.labelText}
          </span>
        </label>
        <a class="tooter__identity"
           href="#"
           style="visibility: ${state.identityVisible ? 'visible' : 'hidden'};"
           title="Click to logout from the bird site">
            (as @${state.username})
        </a>
      </div>`;

    let composeForm = document.querySelector('div#mastodon .compose-form');
    let rootElement = composeForm.querySelector('.compose-form > .tooter');
    if (rootElement) {
      composeForm.removeChild(rootElement);
    }
    composeForm.insertAdjacentHTML('beforeend', html);
    composeForm.querySelector('.tooter__crosspost-checkbox').addEventListener('change', this._checkboxChanged.bind(this));
  }

  _checkboxChanged(event) {
    let checkbox = event.target;
    this.action.toggle(checkbox.checked);
  }

  _tootButtonClicked() {
    let checkbox = document.querySelector('.compose-form .tooter__crosspost-checkbox');
    if (checkbox.checked) {
      let textarea = document.querySelector('.compose-form textarea');
      let toot = textarea.value;
      if (toot.length > 0) {
        this.actions.send(toot);
      }
    }
  }
}

/** Injected extension code **********************************/

detect();

function detect() {
  // Discard non-mastodon web app early
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
    
    debugMessage('Mastodon web root detected: setting up a mutation observer.');
    let uiContainer = mastodonWebAppRoot.querySelector('div.ui');
    let observer = new MutationObserver(function (/* mutations */) {
      debugMessage('Mutation observed: detecting ".ui.is-composing".');
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

function inject() {
  debugMessage('Compose form detected: loading extension');
  let composeForm = document.querySelector('div#mastodon .compose-form');
  if (!composeForm) {
    console.warning('Couldn’t setup tooter extension for Mastodon web app Compose form: the compose form was not found.');
    return;
  }

  birdSiteUI = new BirdSiteUI(composeForm, {
    toggle: toggleCheckbox,
    send: crossPostToTwitter
  });
  store = new BirdSiteStore();

  Twitter.loadCredentials()
  .then((username) => {
    store.transitionToSignedIn(username);
    birdSiteUI.render(store.state);
  })
  .catch(() => {
    store.transitionToSignedOut();
    birdSiteUI.render(store.state);
  });
}

/** Actions */

function toggleCheckbox(checked) {
  store.toggleChecked(checked);
  birdSiteUI.render(store.state);
}

function crossPostToTwitter(message) {
  if (message.length == 0) {
    debug('Avoiding to post empty post to Twitter.');
    return;
  }

  Twitter.loadCredentials()
  .catch(() => {
    store.transitionToAuthenticating();
    birdSiteUI.render(store.state);
    return Twitter.authenticate();
  })
  .then((username) => {
    store.transitionToSignedIn(username);
    birdSiteUI.render(store.state);
  })
  .then(() => {
    store.transitionToPosting();
    birdSiteUI.render(store.state);
    let params = { status: message };
    return Twitter.api('statuses/update', 'POST', params);
  })
  .then(() => {
    store.transitionToSuccess();
    birdSiteUI.render(store.state);
  })
  .catch((error) => {
    store.transitionToFailure();
    birdSiteUI.render(store.state);
    alert('An error occured while posting to Twitter: ' + error);
  });
}

function logoutAction() {
  Twitter.logout();
  store.transitionToSignedOut();
  birdSiteUI.render(store.state);
}

function debugMessage(message) {
  let debugEnabled = false; // set to true to enable debugging
  if (debugEnabled) {
    console.debug(message);
  }
}
