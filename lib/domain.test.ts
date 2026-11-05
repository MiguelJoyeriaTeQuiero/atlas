import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateMeasuredResults, aggregateMetrics, calculateMetrics, compareMeasurement, createEmptyState,
  createProcess, DEFAULT_SETTINGS, priorityScore, snapshotBaseline, validateImport,
  type Measurement, type Process,
} from './domain';

function measured(p: Process, overrides: Partial<Measurement> = {}): Measurement {
  return { id: crypto.randomUUID(), processId: p.id, month: '2026-11', volume: 100, minutesPerCase: 2,
    peoplePerCase: 1, errors: 0, minutesPerError: 0, reviewMinutes: 0, runningCost: 20, realCashSaved: 100,
    source: 'Registro de casos revisado', validated: true, notes: '', createdAt: '2026-11-30T12:00:00Z', updatedAt: '2026-11-30T12:00:00Z', ...overrides };
}
function baselined(overrides: Partial<Process> = {}): Process {
  const p = createProcess({ name: 'Conciliación', volumePerMonth: 100, minutesPerCase: 6, peoplePerCase: 1,
    actualImplementationCost: 100, actualCostSource: 'Factura aprobada', implementationCostValidated: true, ...overrides });
  p.baseline = snapshotBaseline(p, 'Muestra verificada de 100 operaciones', true);
  return p;
}

test('Forecast counts rework once, discounts exceptions, and supervises all adopted cases', () => {
  const metrics = calculateMetrics(createProcess({ volumePerMonth: 100, minutesPerCase: 6, peoplePerCase: 2,
    errorRate: 10, minutesPerError: 30, automatablePct: 50, adoptionPct: 80, exceptionPct: 25,
    errorReductionPct: 100, reviewMinutesPerCase: 0.6 }));
  assert.equal(metrics.baselineCoreHoursMonthly, 20);
  assert.equal(metrics.baselineReworkHoursMonthly, 5);
  assert.equal(metrics.baselineHoursMonthly, 25);
  assert.equal(metrics.coreHoursFreedMonthly, 6);
  assert.equal(metrics.reworkHoursFreedMonthly, 3);
  assert.equal(metrics.reviewHoursMonthly, 0.8);
  assert.equal(metrics.netHoursFreedMonthly, 8.2);
  assert.equal(metrics.expectedErrorsMonthly, 4);
});

test('Freed capacity is not counted as cash by default', () => {
  const metrics = calculateMetrics(createProcess({ volumePerMonth: 100, minutesPerCase: 60,
    automatablePct: 100, adoptionPct: 100, hourlyCost: 20, monthlyRunningCost: 50, implementationCost: 100 }));
  assert.equal(metrics.capacityValueMonthly, 2000);
  assert.equal(metrics.grossCashBenefitMonthly, 0);
  assert.equal(metrics.netCashBenefitMonthly, -50);
  assert.equal(metrics.annualCashRoiPct, -100);
  assert.equal(metrics.cashPaybackMonths, null);
});

test('Negative time and financial outcomes are visible', () => {
  const metrics = calculateMetrics(createProcess({ volumePerMonth: 60, minutesPerCase: 1,
    automatablePct: 0, adoptionPct: 100, reviewMinutesPerCase: 10, hourlyCost: 20, cashRealizationPct: 100 }));
  assert.equal(metrics.netHoursFreedMonthly, -10);
  assert.equal(metrics.capacityValueMonthly, -200);
  assert.equal(metrics.netCashBenefitMonthly, -200);
});

test('Zero-cost ROI is undefined and never Infinity', () => {
  const metrics = calculateMetrics(createProcess({ cashSavingsMonthly: 100 }));
  assert.equal(metrics.annualCashRoiPct, null);
  assert.equal(metrics.cashPaybackMonths, 0);
  assert.equal(metrics.timeReductionPct, null);
  assert.ok(!Object.values(metrics).some(value => typeof value === 'number' && !Number.isFinite(value)));
});

test('Portfolio ROI uses total cash and total cost, not a mean of process ROI', () => {
  const a = createProcess({ implementationCost: 100, cashSavingsMonthly: 1000 });
  const b = createProcess({ implementationCost: 9900, cashSavingsMonthly: 0 });
  assert.equal(aggregateMetrics([a,b]).annualCashRoiPct, 20);
});

test('Priority is normalized and penalizes estimates and poor readiness transparently', () => {
  const p = createProcess({ impact: {time:5,cost:5,errors:5,speed:5,trace:5,decisions:5,sales:5,service:5}, complexity:1,risk:1,dataReadiness:5,evidenceLevel:'validated' });
  assert.equal(priorityScore(p),100);
  assert.equal(priorityScore({...p,evidenceLevel:'estimate'}),75);
  assert.equal(priorityScore({...p,dataReadiness:1}),60);
  assert.equal(priorityScore(p,{...DEFAULT_SETTINGS,weights:{time:0,cost:0,errors:0,speed:0,trace:0,decisions:0,sales:0,service:0}}),0);
});

test('Observed comparison applies the frozen baseline to observed volume', () => {
  const p = baselined({errorRate:10,minutesPerError:10});
  const m = measured(p,{volume:200,minutesPerCase:3,errors:10,minutesPerError:10,reviewMinutes:60});
  const comparison = compareMeasurement({...p,minutesPerCase:999},m);
  assert.equal(comparison.kind,'verified');
  assert.equal(comparison.baselineHoursAtObservedVolume,23.33);
  assert.equal(comparison.observedHours,12.67);
  assert.equal(comparison.hoursFreed,10.67);
  assert.equal(comparison.observedErrorRate,5);
});

test('Empty periods, missing evidence and missing frozen baselines never become verified', () => {
  const p = baselined();
  assert.equal(compareMeasurement(p,measured(p,{volume:0})).kind,'unverified');
  assert.equal(compareMeasurement(p,measured(p,{source:''})).kind,'unverified');
  assert.equal(compareMeasurement({...p,baseline:undefined},measured(p)).kind,'missing-baseline');
});

test('Observed rates and minutes are weighted by case volume', () => {
  const p = baselined();
  const result = aggregateMeasuredResults([p],[measured(p,{month:'2026-10',volume:1000,minutesPerCase:1,errors:10}),measured(p,{volume:100,minutesPerCase:10,errors:10})]);
  assert.equal(result.weightedMinutesPerCase,1.82);
  assert.equal(result.observedErrorRate,1.82);
  assert.equal(result.totalVolume,1100);
  assert.equal(result.periodStart,'2026-10');
  assert.equal(result.periodEnd,'2026-11');
});

test('Observed ROI uses real investment once and only actually recorded periods', () => {
  const p = baselined({implementationCost:99999,actualImplementationCost:400});
  const result = aggregateMeasuredResults([p],[measured(p,{month:'2026-10',realCashSaved:300,runningCost:50}),measured(p,{realCashSaved:300,runningCost:50})]);
  assert.equal(result.actualInvestmentCost,400);
  assert.equal(result.totalRealCashSaved,600);
  assert.equal(result.totalRunningCost,100);
  assert.equal(result.cashRoiPct,20);
  assert.equal(result.cashNetAfterInvestment,100);
  assert.equal(result.needsCostValidation,false);
});

test('Estimated investment cannot certify observed financial ROI; validated zero is legitimate', () => {
  const p = baselined({actualImplementationCost:undefined,implementationCostValidated:false});
  assert.equal(aggregateMeasuredResults([p],[measured(p)]).cashRoiPct,null);
  assert.equal(aggregateMeasuredResults([p],[measured(p)]).needsCostValidation,true);
  const zero = {...p,actualImplementationCost:0,actualCostSource:'Sin coste de implantación; confirmado',implementationCostValidated:true};
  assert.equal(aggregateMeasuredResults([zero],[measured(zero)]).cashRoiPct,400);
  assert.equal(aggregateMeasuredResults([zero],[measured(zero,{runningCost:0})]).cashRoiPct,null);
});

test('Different reporting coverage is exposed rather than hidden in a monthly average', () => {
  const a = baselined(); const b = baselined();
  const result = aggregateMeasuredResults([a,b],[measured(a,{month:'2026-10'}),measured(a),measured(b)]);
  assert.equal(result.allPeriodsAligned,false);
  assert.equal(result.coverageByProcess.length,2);
});

test('Import rejects invalid percentages, missing references and duplicate process/month measurements', () => {
  const state = createEmptyState(); const p = baselined();
  state.processes.push({...p,adoptionPct:101});
  state.measurements.push(measured(p),measured(p));
  const result = validateImport(state);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(e=>e.includes('adoptionPct')));
  assert.ok(result.errors.some(e=>e.includes('ya existe una medición')));
});

test('Evidence can precede a process, but must reference a valid session or department', () => {
  const state = createEmptyState();
  state.evidence.push({id:crypto.randomUUID(),departmentId:'compras',anonymized:true,name:'Observación',type:'observation',description:'Muestra',source:'Entrevista',createdAt:'2026-11-04T12:00:00Z',validated:false});
  assert.equal(validateImport(state).valid,true);
  delete state.evidence[0].departmentId;
  assert.equal(validateImport(state).valid,false);
});

test('Import rejects non-finite inputs and an unsupported schema without changing live state', () => {
  const original = createEmptyState();
  const malformed = {...original,processes:[createProcess({hourlyCost:Infinity})]};
  assert.equal(validateImport(malformed).valid,false);
  assert.equal(validateImport({...original,schemaVersion:2}).valid,false);
  assert.equal(original.processes.length,0);
});
