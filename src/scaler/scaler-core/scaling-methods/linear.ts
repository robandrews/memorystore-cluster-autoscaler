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

/** @fileoverview Linear scaling method.
 *
 * Suggests adding or removing shards calculated with proportionality to the
 * resources used.
 */

const {AutoscalerDirection} = require('../../../autoscaler-common/types');
const baseModule = require('./base');
const {logger} = require('../../../autoscaler-common/logger');

/**
 * @typedef {import(
 *   '../../../autoscaler-common/types').AutoscalerMemorystoreCluster}
 *   AutoscalerMemorystoreCluster
 * @typedef {import(
 *   '../../../autoscaler-common/types').MemorystoreClusterMetricValue}
 *   MemorystoreClusterMetricValue
 * @typedef {import('../../../autoscaler-common/types').RuleSet}
 *   RuleSet
 * @typedef {import('../../../autoscaler-common/types').RuleEngineAnalysis}
 *   RuleEngineAnalysis
 * @typedef {import('../../../autoscaler-common/types').Condition}
 *   Condition
 * @typedef {import('../../../autoscaler-common/types').ScalingMetricList}
 *   ScalingMetricList
 */

/**
 * Gets the metrics for scaling based on direction.
 *
 * When multiple rules provide different condition values, we use the highest.
 *
 * @param {AutoscalerMemorystoreCluster} cluster for which to get scaling
 *   metrics.
 * @param {AutoscalerDirection} direction in which we are scaling.
 * @param {?RuleEngineAnalysis} engineAnalysis Results from the engine analysis.
 * @return {!ScalingMetricList} List of scaling metrics that are selected for
 *   scaling with name, value and threshold.
 */
function getMetricsForScaling(cluster, direction, engineAnalysis) {
  if (!engineAnalysis) return [];

  const /** @type {Condition[]} */ matchedConditions =
      engineAnalysis.matchedConditions[direction];
  if (!matchedConditions) return [];

  const /** @type {!Set<string>} */ scalingMetrics =
      engineAnalysis.scalingMetrics[direction];
  if (!scalingMetrics) return [];

  // Doing a map and filter would be more elegant, but filter() does not
  // properly narrow down types.
  const /** @type {ScalingMetricList} */ matchedMetrics: any[] = [];
  for (const matchedCondition of matchedConditions) {
    const metricName = matchedCondition.fact;
    if (!scalingMetrics.has(metricName)) continue;

    const metricValue = matchedCondition.factResult;
    const metricThreshold = matchedCondition.value;

    // This should not happen since the rules engine won't be able to trigger
    // this rule if the metric (fact) is not defined.
    if (metricValue === null || metricValue === undefined) {
      logger.error({
        message:
          `Unable to use this metric for linear scaling. ` +
          `No value for metric ${metricName} on the cluster. ` +
          `Consider removing this metric from scalingMetrics or adding a ` +
          `value to the condition for the fact with this name.`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        instanceId: cluster.clusterId,
      });
      continue;
    }

    // This should not happen since the rules engine won't be able to trigger
    // this rule if there is not threshold (condition.value).
    if (typeof metricThreshold !== 'number') {
      logger.error({
        message:
          `Unable to use this metric for linear scaling. ` +
          `No numeric threshold value for ${metricName}. ` +
          `Consider removing this metric from scalingMetrics or adding a ` +
          `numeric value to the condition for the fact with this name. ` +
          `If a value is already added, ensure it is a number (numeric type).`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        instanceId: cluster.clusterId,
      });
      continue;
    }

    if (metricThreshold === 0) {
      logger.error({
        message:
          `Unable to use this metric for linear scaling. ` +
          `The threshold value for ${metricName} is 0. Linear scaling uses ` +
          `threshold value as part of the cross multiplication to calculate ` +
          `the size and it is not possible to divide by 0. ` +
          `Consider removing this metric from scalingMetrics or adding a ` +
          `value other than 0 to the condition for the fact with this name.`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        instanceId: cluster.clusterId,
      });
      continue;
    }

    const matchedMetric /** @type {MemorystoreClusterMetricValue} */ = {
      name: metricName,
      value: metricValue,
      threshold: metricThreshold,
    };

    matchedMetrics.push(matchedMetric);
  }

  return matchedMetrics;
}

/**
 * Calculates the suggested cluster size for a given metric.
 *
 * @param {AutoscalerMemorystoreCluster} cluster for which to suggest a new
 *   size.
 * @param {AutoscalerDirection} direction Direction in which to scale.
 * @param {?RuleEngineAnalysis} engineAnalysis Results from the engine analysis.
 * @return {number} Final suggested size for the cluster.
 */
function getSuggestedSize(cluster, direction, engineAnalysis) {
  if (!engineAnalysis) return cluster.currentSize;
  if (direction === AutoscalerDirection.NONE) return cluster.currentSize;

  const scalingMetricList = getMetricsForScaling(
    cluster,
    direction,
    engineAnalysis,
  );
  if (!scalingMetricList) return cluster.currentSize;

  let suggestedSize: number | null = null;
  for (const scalingMetric of scalingMetricList) {
    // This should not happen as this check is done on getMetricsForScaling
    // and an error message is logged. However, this helps type inference.
    if (!scalingMetric.threshold) continue;

    // Linear scaling main calculation.
    const metricSuggestedSize = Math.ceil(
      cluster.currentSize * (scalingMetric.value / scalingMetric.threshold),
    );

    suggestedSize = Math.max(suggestedSize || 0, metricSuggestedSize);
  }
  if (suggestedSize === null) suggestedSize = cluster.currentSize;

  if (direction === AutoscalerDirection.IN) {
    if (cluster.scaleInLimit) {
      suggestedSize = Math.max(
        suggestedSize!,
        cluster.currentSize - cluster.scaleInLimit,
      );
    }

    if (suggestedSize! < cluster.currentSize) return suggestedSize!;
  } else if (direction === AutoscalerDirection.OUT) {
    if (cluster.scaleOutLimit) {
      suggestedSize = Math.min(
        suggestedSize!,
        cluster.currentSize + cluster.scaleOutLimit,
      );
    }

    if (suggestedSize! > cluster.currentSize) return suggestedSize!;
  }

  return cluster.currentSize;
}

/**
 * Calculates cluster size for the Linear scaling method.
 *
 * @param {AutoscalerMemorystoreCluster} cluster to scale.
 * @param {RuleSet} ruleSet to use to determine scaling decisions.
 * @return {Promise<number>} with the number of nodes to which to scale.
 */
async function calculateSize(cluster, ruleSet) {
  return baseModule.calculateScalingDecision(
    cluster,
    ruleSet,
    getSuggestedSize,
  );
}

module.exports = {calculateSize};
