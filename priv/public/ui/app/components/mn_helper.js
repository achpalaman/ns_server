(function () {
  "use strict";

  angular
    .module('mnHelper', [
      'ui.router',
      'mnTasksDetails',
      'mnAlertsService',
      'mnBucketsService'
    ])
    .provider('mnHelper', mnHelperProvider);

  function mnHelperProvider() {

    return {
      $get: mnHelperFactory,
      setDefaultBucketName: setDefaultBucketName
    };

    function setDefaultBucketName(bucketParamName, stateRedirect, memcached) {
      return function ($q, $state, mnBucketsService, $stateParams) {
        var deferred = $q.defer();

        if ($stateParams[bucketParamName] === null) {
          mnBucketsService.getBucketsByType(true).then(function (buckets) {
            var defaultBucket = memcached ? buckets.byType.defaultName : buckets.byType.membase.defaultName;
            if (!defaultBucket) {
              deferred.resolve();
            } else {
              deferred.reject();
              $stateParams[bucketParamName] = defaultBucket;
              $state.go(stateRedirect, $stateParams);
            }
          });
        } else {
          deferred.resolve();
        }

        return deferred.promise;
      };
    }
    function mnHelperFactory($window, $state, $stateParams, $location, $timeout, $q, mnTasksDetails, mnAlertsService, $http, mnPendingQueryKeeper) {
      var mnHelper = {
        wrapInFunction: wrapInFunction,
        calculateMaxMemorySize: calculateMaxMemorySize,
        initializeDetailsHashObserver: initializeDetailsHashObserver,
        checkboxesToList: checkboxesToList,
        reloadApp: reloadApp,
        reloadState: reloadState
      };

      return mnHelper;

      function wrapInFunction(value) {
        return function () {
          return value;
        };
      }
      function calculateMaxMemorySize(totalRAMMegs) {
        return Math.floor(Math.max(totalRAMMegs * 0.8, totalRAMMegs - 1024));
      }
      function initializeDetailsHashObserver($scope, hashKey, stateName) {
        function getHashValue() {
          return $state.params[hashKey] || [];
        }
        $scope.isDetailsOpened = function (hashValue) {
          return _.contains(getHashValue(), String(hashValue));
        };
        $scope.toggleDetails = function (hashValue) {
          var currentlyOpened = getHashValue();
          var stateParams = {};
          if ($scope.isDetailsOpened(hashValue)) {
            stateParams[hashKey] = _.difference(currentlyOpened, [String(hashValue)]);
            $state.go(stateName, stateParams);
          } else {
            currentlyOpened.push(String(hashValue));
            stateParams[hashKey] = currentlyOpened;
            $state.go(stateName, stateParams);
          }
        };
      }
      function checkboxesToList(object) {
        return _.chain(object).pick(angular.identity).keys().value();
      }
      function reloadApp() {
        $window.location.reload();
      }
      function reloadState() {
        mnPendingQueryKeeper.cancelAllQueries();
        $state.transitionTo($state.current, $stateParams, {reload: true, inherit: true});
      }
    }
  }
})();
