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
 * ESLINT: Ignore max line length errors on lines starting with 'it('
 * (test descriptions)
 */
/* eslint max-len: ["error", { "ignorePattern": "^\\s*it\\(" }] */

const rewire = require('rewire');
const sinon = require('sinon');
// @ts-ignore
const referee = require('@sinonjs/referee');
// @ts-ignore
const assert = referee.assert;
const {createClusterParameters} = require('../test-utils');
const {AutoscalerDirection} = require('../../../../autoscaler-common/types');
const app = rewire('../../scaling-methods/stepwise.ts');

/**
 * @typedef {import('../../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 */

afterEach(() => {
  // Restore the default sandbox here
  sinon.restore();
});

/**
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {AutoscalerDirection} direction
 * @return {sinon.SinonStub} base module
 */
function stubBaseModule(cluster, direction) {
  const callbackStub = sinon.stub().callsArgWith(2, cluster, direction);
  app.__set__('baseModule.calculateScalingDecision', callbackStub);
  app.__set__('baseModule.getScalingDirection', () => direction);
  return callbackStub;
}

const calculateSize = app.__get__('calculateSize');
describe('#stepwise.calculateSize', () => {
  it('should return current size if no scaling is needed', async () => {
    const cluster = createClusterParameters({currentSize: 10, stepSize: 2});
    const callbackStub = stubBaseModule(cluster, AutoscalerDirection.NONE);
    const size = await calculateSize(cluster, null);
    size.should.equal(10);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return current size increased by stepSize if scale OUT is suggested', async () => {
    const cluster = createClusterParameters({currentSize: 6, stepSize: 1});
    const callbackStub = stubBaseModule(cluster, AutoscalerDirection.OUT);
    const size = await calculateSize(cluster, null);
    size.should.equal(7);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return current size decreased by stepSize if scale IN is suggested', async () => {
    const cluster = createClusterParameters({currentSize: 6, stepSize: 1});
    const callbackStub = stubBaseModule(cluster, AutoscalerDirection.IN);
    const size = await calculateSize(cluster, null);
    size.should.equal(5);
    assert.equals(callbackStub.callCount, 1);
  });
});
