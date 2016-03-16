(function () {
  "use strict";

  angular.module('app', [
    'mnAdmin',
    'mnAuth',
    'mnWizard',
    'mnHttp',
    'mnExceptionReporter',
    'ui.bootstrap'
  ]).run(appRun);

  function appRun($state, $urlRouter, $exceptionHandler, mnPools, $window, $http, $templateCache, $transitions) {

    var originalOnerror = $window.onerror;
    $window.onerror = onError;
    function onError(message, url, lineNumber, columnNumber, exception) {
      $exceptionHandler({
        message: message,
        fileName: url,
        lineNumber: lineNumber,
        columnNumber: columnNumber,
        stack: exception.stack
      });
      originalOnerror && originalOnerror.apply($window, Array.prototype.slice.call(arguments));
    }

    angular.forEach(angularTemplatesList, function (url) {
      $http.get(url, {cache: $templateCache});
    });

    mnPools.get().then(function (pools) {
      if (!pools.isInitialized) {
        return $state.go('app.wizard.welcome');
      }
    }, function (resp) {
      switch (resp.status) {
        case 401: return $state.go('app.auth');
      }
    }).then(function () {
      $urlRouter.listen();
      $urlRouter.sync();
    })

    $transitions.defaultErrorHandler(function (error) {
      error && $exceptionHandler(error);
    });
  }
})();