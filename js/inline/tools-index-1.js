    Sentry.onLoad(function () {
      Sentry.init({
        environment: location.hostname === 'profinancecast.com' ? 'production' : 'preview',
      });
    });
