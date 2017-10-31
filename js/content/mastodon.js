run();

function debugMessage(message) {
    let debugEnabled = false; // set to true to enable debugging
    if (debugEnabled) {
        console.debug(message);
    }
}

function run() {
    // Discard non-mastodon web app early
    let mastodonWebAppRoot = document.querySelector('body > div#mastodon');
    if (!mastodonWebAppRoot) {
        debugMessage('No mastodon web root detected: aborting.');
        return;
    }

    let mastodonComposeForm = document.querySelector('div#mastodon .compose-form');
    if (mastodonComposeForm) {
        setup();

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
        let observer = new MutationObserver(function (mutations) {
            debugMessage('Mutation observed: detecting ".ui.is-composing".');
            let isComposeFormFocused = uiContainer.classList.contains('is-composing');
            if (isComposeFormFocused) {
                setup();
                // When displaying the mobile web UI, the compose form may be removed and
                // then made visible again.
                // Keep the observer active, so that we can re-attach our custom UI
                // if this happens.
            }
        });
        observer.observe(uiContainer, { attributes: true, attributeFilter: ['class'] });
    }
}

function setup() {
    debugMessage('Compose form detected: loading extension');
    let composeForm = document.querySelector('div#mastodon .compose-form');
    if (!composeForm) {
        console.warning('Couldn’t setup tooter extension for Mastodon web app Compose form: the compose form was not found.');
        return;
    }

    if (!composeForm.classList.contains('tooter')) {
        composeForm.classList.add('tooter');

        // Add "Post to Twitter checkbox"
        let tooterContainer = document.createElement('div');
        tooterContainer.setAttribute('class', 'compose-form__tooter');
        composeForm.appendChild(tooterContainer);

        let label = document.createElement('label');
        label.setAttribute('class', 'tooter__crosspost');
        tooterContainer.appendChild(label);

        let checkbox = document.createElement('input');
        checkbox.setAttribute('class', 'tooter__crosspost-checkbox');
        checkbox.setAttribute('name', 'tooter-crosspost-checkbox');
        checkbox.setAttribute('type', 'checkbox');
        label.appendChild(checkbox);

        let labelText = document.createTextNode("Also post on Twitter");
        label.appendChild(labelText);

        // Add click event to the "Toot!" button
        let tootButton = composeForm.querySelector('.compose-form__publish button');
        tootButton.addEventListener('click', didClickTootButton);
    }
}

function didClickTootButton() {
    let crossPostCheckbox = document.querySelector('.tooter__crosspost-checkbox');

    if (crossPostCheckbox.checked) {
        let textarea = document.querySelector('.compose-form textarea');
        let tootText = textarea.value;
        crossPostToTwitter(tootText);
    }
}

function crossPostToTwitter(message) {
    if (message.length == 0) {
        debug('Avoiding to post empty post to Twitter.');
        return;
    }

    alert('Cross-post message to Twitter : ' + message);
}
