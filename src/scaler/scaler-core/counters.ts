/* Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License
 */

/*
 * Autoscaler Counters package
 *
 * Publishes Counters to Cloud Monitoring
 *
 */
const CountersBase = require('../../autoscaler-common/counters-base');

const COUNTERS_PREFIX = 'scaler/';

const COUNTER_NAMES = {
  SCALING_SUCCESS: COUNTERS_PREFIX + 'scaling-success',
  SCALING_DENIED: COUNTERS_PREFIX + 'scaling-denied',
  SCALING_FAILED: COUNTERS_PREFIX + 'scaling-failed',
  REQUESTS_SUCCESS: COUNTERS_PREFIX + 'requests-success',
  REQUESTS_FAILED: COUNTERS_PREFIX + 'requests-failed',
  SCALING_DURATION: COUNTERS_PREFIX + 'scaling-duration',
};

const ATTRIBUTE_NAMES = {
  ...CountersBase.COUNTER_ATTRIBUTE_NAMES,
  SCALING_DENIED_REASON: 'scaling_denied_reason',
  SCALING_METHOD: 'scaling_method',
  SCALING_DIRECTION: 'scaling_direction',
};

/**
 * @typedef {import('../../autoscaler-common/types.js')
 *    .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 */
/**
 * @typedef {import('@opentelemetry/api').Attributes} Attributes
 */

/**
 * @type {import('../../autoscaler-common/counters-base.js')
 *    .CounterDefinition[]}
 */
const COUNTERS = [
  {
    counterName: COUNTER_NAMES.SCALING_SUCCESS,
    counterDesc:
      'The number of Memorystore Cluster scaling events that succeeded',
  },
  {
    counterName: COUNTER_NAMES.SCALING_DENIED,
    counterDesc: 'The number of Memorystore Cluster scaling events denied',
  },
  {
    counterName: COUNTER_NAMES.SCALING_FAILED,
    counterDesc: 'The number of Memorystore Cluster scaling events that failed',
  },
  {
    counterName: COUNTER_NAMES.REQUESTS_SUCCESS,
    counterDesc: 'The number of scaling request messages handled successfully',
  },
  {
    counterName: COUNTER_NAMES.REQUESTS_FAILED,
    counterDesc: 'The number of scaling request messages that failed',
  },
  {
    counterName: COUNTER_NAMES.SCALING_DURATION,
    counterDesc: 'The time taken to complete the scaling operation',
    counterType: 'HISTOGRAM',
    counterUnits: 'ms', // milliseconds
    // This creates a set of 25 buckets with exponential growth
    // starting at 0s, 22s, 49s, 81s increasing to 7560s ~= 126mins
    counterHistogramBuckets: [...Array(25).keys()].map((n) =>
      Math.floor(60_000 * (2 ** (n / 4) - 1)),
    ),
  },
];

const pendingInit = CountersBase.createCounters(COUNTERS);

/**
 * Build an attribute object for the counter
 *
 * @private
 * @param {AutoscalerMemorystoreCluster} cluster config object
 * @param {number} [requestedSize]
 * @param {number?} [previousSize] overrides currentSize in cluster object
 * @param {string?} [scalingMethod] overrides scalingMethod in cluster object
 * @return {Attributes}
 */
function _getCounterAttributes(
  cluster,
  requestedSize?,
  previousSize?,
  scalingMethod?,
) {
  if (previousSize == null) {
    previousSize = cluster.currentSize;
  }
  if (scalingMethod == null) {
    scalingMethod = cluster.scalingMethod;
  }

  const ret = {
    [ATTRIBUTE_NAMES.CLUSTER_PROJECT_ID]: cluster.projectId,
    [ATTRIBUTE_NAMES.CLUSTER_INSTANCE_ID]: cluster.clusterId,
    [ATTRIBUTE_NAMES.SCALING_METHOD]: scalingMethod,
  };

  if (requestedSize) {
    ret[ATTRIBUTE_NAMES.SCALING_DIRECTION] =
      requestedSize > previousSize
        ? 'SCALE_UP'
        : requestedSize < previousSize
          ? 'SCALE_DOWN'
          : 'SCALE_SAME';
  }
  return ret;
}

/**
 * Increment scaling success counter
 *
 * @param {AutoscalerMemorystoreCluster} cluster config object
 * @param {number} requestedSize
 * @param {number?} [previousSize] overrides currentSize in cluster object
 * @param {string?} [scalingMethod] overrides scalingMethod in cluster object
 */
async function incScalingSuccessCounter(
  cluster,
  requestedSize,
  previousSize,
  scalingMethod,
) {
  await pendingInit;
  CountersBase.incCounter(
    COUNTER_NAMES.SCALING_SUCCESS,
    _getCounterAttributes(cluster, requestedSize, previousSize, scalingMethod),
  );
}

/**
 * Increment scaling failed counter
 *
 * @param {AutoscalerMemorystoreCluster} cluster config object
 * @param {number} requestedSize
 * @param {number?} [previousSize] overrides currentSize in cluster object
 * @param {string?} [scalingMethod] overrides scalingMethod in cluster object
 */
async function incScalingFailedCounter(
  cluster,
  requestedSize,
  previousSize,
  scalingMethod,
) {
  await pendingInit;
  CountersBase.incCounter(
    COUNTER_NAMES.SCALING_FAILED,
    _getCounterAttributes(cluster, requestedSize, previousSize, scalingMethod),
  );
}

/**
 * Increment scaling denied counter
 *
 * @param {AutoscalerMemorystoreCluster} cluster config object
 * @param {number} requestedSize
 * @param {string} reason
 */
async function incScalingDeniedCounter(cluster, requestedSize, reason) {
  await pendingInit;
  CountersBase.incCounter(COUNTER_NAMES.SCALING_DENIED, {
    ..._getCounterAttributes(cluster, requestedSize),
    [ATTRIBUTE_NAMES.SCALING_DENIED_REASON]: reason,
  });
}

/**
 * Increment messages success counter
 */
async function incRequestsSuccessCounter() {
  await pendingInit;
  CountersBase.incCounter(COUNTER_NAMES.REQUESTS_SUCCESS);
}

/**
 * Increment messages failed counter
 */
async function incRequestsFailedCounter() {
  await pendingInit;
  CountersBase.incCounter(COUNTER_NAMES.REQUESTS_FAILED);
}

/**
 * Record scaling duration to the distribution.
 *
 * @param {number} durationMillis
 * @param {AutoscalerMemorystoreCluster} cluster config object
 * @param {number} requestedSize
 * @param {number?} [previousSize] overrides currentSize in cluster object
 * @param {string?} [scalingMethod] overrides scalingMethod in cluster object
 */
async function recordScalingDuration(
  durationMillis,
  cluster,
  requestedSize,
  previousSize,
  scalingMethod,
) {
  await pendingInit;
  CountersBase.recordValue(
    COUNTER_NAMES.SCALING_DURATION,
    Math.floor(durationMillis),
    _getCounterAttributes(cluster, requestedSize, previousSize, scalingMethod),
  );
}

module.exports = {
  incScalingSuccessCounter,
  incScalingFailedCounter,
  incScalingDeniedCounter,
  incRequestsSuccessCounter,
  incRequestsFailedCounter,
  recordScalingDuration,
  tryFlush: CountersBase.tryFlush,
};
