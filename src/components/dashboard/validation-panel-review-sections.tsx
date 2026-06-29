'use client';

import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, Code2, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';

type Translator = (ko: string, en: string) => string;

function SnapshotItem({
  panelCardClassName,
  cardStyle,
  mutedTextStyle,
  strongTextStyle,
  label,
  value,
  className,
}: {
  panelCardClassName: string;
  cardStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  strongTextStyle?: CSSProperties;
  label: string;
  value: ReactNode;
  className: string;
}) {
  return (
    <div className={panelCardClassName} style={cardStyle}>
      <span className="text-slate-500 block" style={mutedTextStyle}>{label}</span>
      <span className={className} style={className.includes('text-slate-300') ? strongTextStyle : undefined}>{value}</span>
    </div>
  );
}

export function ValidationReviewFocusSection({
  panelSectionClassName,
  sectionStyle,
  headingStyle,
  bodyStyle,
  t,
}: {
  panelSectionClassName: string;
  sectionStyle?: CSSProperties;
  headingStyle?: CSSProperties;
  bodyStyle?: CSSProperties;
  t: Translator;
}) {
  return (
    <div className={`${panelSectionClassName} border-[#1f3a2c] bg-[#08140e]`} style={sectionStyle}>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={headingStyle}>
        {t('검토 기준', 'Review focus')}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-200" style={bodyStyle}>
        {t('PCB 전에 전압, 핀 선택, 문서 근거를 먼저 확인합니다.', 'Check voltage, pin choices, and documentation before PCB work.')}
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400" style={bodyStyle}>
        {t('시뮬레이션보다 먼저, 회로에서 바로 위험해질 부분을 리뷰합니다.', 'Before simulation, review the parts of the circuit most likely to cause trouble.')}
      </p>
    </div>
  );
}

export function ValidationProjectSnapshotSection({
  panelSectionClassName,
  panelCardClassName,
  sectionStyle,
  cardStyle,
  mutedTextStyle,
  strongTextStyle,
  verifiedSensors,
  holdSensors,
  auditIssueCount,
  componentCount,
  manualLockCount,
  solvedNetCount,
  netCount,
  t,
}: {
  panelSectionClassName: string;
  panelCardClassName: string;
  sectionStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  strongTextStyle?: CSSProperties;
  verifiedSensors: number;
  holdSensors: number;
  auditIssueCount: number;
  componentCount: number;
  manualLockCount: number;
  solvedNetCount: number;
  netCount: number;
  t: Translator;
}) {
  return (
    <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500" style={mutedTextStyle}>
        {t('프로젝트 스냅샷', 'Project snapshot')}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <SnapshotItem panelCardClassName={panelCardClassName} cardStyle={cardStyle} mutedTextStyle={mutedTextStyle} strongTextStyle={strongTextStyle} label="Verified Sensors" value={verifiedSensors} className="text-[#86efac] font-bold" />
        <SnapshotItem panelCardClassName={panelCardClassName} cardStyle={cardStyle} mutedTextStyle={mutedTextStyle} strongTextStyle={strongTextStyle} label="Hold Queue" value={holdSensors} className="text-[#f87171] font-bold" />
        <SnapshotItem panelCardClassName={panelCardClassName} cardStyle={cardStyle} mutedTextStyle={mutedTextStyle} strongTextStyle={strongTextStyle} label="Audit Issues" value={auditIssueCount} className="text-slate-300 font-bold" />
        <SnapshotItem panelCardClassName={panelCardClassName} cardStyle={cardStyle} mutedTextStyle={mutedTextStyle} strongTextStyle={strongTextStyle} label="Project Parts" value={componentCount} className="text-[#eab308] font-bold" />
        <SnapshotItem panelCardClassName={panelCardClassName} cardStyle={cardStyle} mutedTextStyle={mutedTextStyle} strongTextStyle={strongTextStyle} label="Locked Pins" value={manualLockCount} className="text-slate-300 font-bold" />
        <SnapshotItem
          panelCardClassName={panelCardClassName}
          cardStyle={cardStyle}
          mutedTextStyle={mutedTextStyle}
          strongTextStyle={strongTextStyle}
          label="Solved Nets"
          value={`${solvedNetCount} / ${netCount}`}
          className="text-[#60a5fa] font-bold"
        />
      </div>
    </div>
  );
}

export function ValidationProjectOverviewSection({
  panelSectionClassName,
  panelCardClassName,
  sectionStyle,
  cardStyle,
  mutedTextStyle,
  strongTextStyle,
  verifiedSensors,
  holdSensors,
  auditIssueCount,
  componentCount,
  manualLockCount,
  solvedNetCount,
  netCount,
  allRouted,
  genericCount,
  nextActions,
  circuitSummary,
  t,
}: {
  panelSectionClassName: string;
  panelCardClassName: string;
  sectionStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  strongTextStyle?: CSSProperties;
  verifiedSensors: number;
  holdSensors: number;
  auditIssueCount: number;
  componentCount: number;
  manualLockCount: number;
  solvedNetCount: number;
  netCount: number;
  allRouted: boolean;
  genericCount: number;
  nextActions: string[];
  circuitSummary: {
    netCount: number;
    resistorCount: number;
    circuitIssueCount: number;
  };
  t: Translator;
}) {
  return (
    <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
        <Sparkles size={11} className="text-[#60a5fa]" />
        {t('진행 요약', 'Review summary')}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>{t('배선 상태', 'Routing')}</div>
          <div className={allRouted ? 'font-bold text-[#86efac]' : 'font-bold text-[#fcd34d]'}>
            {allRouted ? t('완료', 'Ready') : t('점검 필요', 'Needs review')}
          </div>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>{t('문서 근거', 'Evidence')}</div>
          <div className={genericCount === 0 ? 'font-bold text-[#86efac]' : 'font-bold text-[#fcd34d]'}>
            {genericCount === 0 ? t('양호', 'Good') : t('보강 필요', 'Needs backup')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>{t('부품', 'Parts')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{componentCount}</div>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>{t('연결 넷', 'Solved nets')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{`${solvedNetCount}/${netCount}`}</div>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>{t('회로 이슈', 'Circuit issues')}</div>
          <div className={circuitSummary.circuitIssueCount > 0 ? 'font-bold text-[#fcd34d]' : 'font-bold text-[#86efac]'}>
            {circuitSummary.circuitIssueCount}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-emerald-300">
          {t(`검증 센서 ${verifiedSensors}`, `Verified sensors ${verifiedSensors}`)}
        </span>
        <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-amber-200">
          {t(`보류 ${holdSensors}`, `Hold ${holdSensors}`)}
        </span>
        <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
          {t(`수동 고정 ${manualLockCount}`, `Locked ${manualLockCount}`)}
        </span>
        <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
          {t(`저항 ${circuitSummary.resistorCount}`, `Resistors ${circuitSummary.resistorCount}`)}
        </span>
        <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
          {t(`전체 이슈 ${auditIssueCount}`, `Issues ${auditIssueCount}`)}
        </span>
      </div>

      {nextActions.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500" style={mutedTextStyle}>
            {t('다음 조치', 'Next actions')}
          </div>
          <div className="space-y-2">
            {nextActions.slice(0, 2).map(action => (
              <div key={action} className={`${panelCardClassName} text-[11px] text-slate-300`} style={cardStyle}>
                {action}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ValidationReviewStatusSection({
  panelSectionClassName,
  panelCardClassName,
  sectionStyle,
  cardStyle,
  mutedTextStyle,
  auditIssueCount,
  allRouted,
  genericCount,
  nextActions,
  t,
}: {
  panelSectionClassName: string;
  panelCardClassName: string;
  sectionStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  auditIssueCount: number;
  allRouted: boolean;
  genericCount: number;
  nextActions: string[];
  t: Translator;
}) {
  return (
    <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
        {auditIssueCount === 0 ? (
          <ShieldCheck size={11} className="text-[#22c55e]" />
        ) : (
          <ShieldAlert size={11} className="text-[#fbbf24]" />
        )}
        {t('검토 상태', 'Review status')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>배선 상태</div>
          <div className={allRouted ? 'text-[#86efac] font-bold' : 'text-[#fcd34d] font-bold'}>
            {allRouted ? '완료' : '점검 필요'}
          </div>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>문서 근거</div>
          <div className={genericCount === 0 ? 'text-[#86efac] font-bold' : 'text-[#fcd34d] font-bold'}>
            {genericCount === 0 ? '양호' : '보강 필요'}
          </div>
        </div>
      </div>
      <div className="space-y-2 pt-1">
        {nextActions.map(action => (
          <div key={action} className={`${panelCardClassName} text-[11px] text-slate-300`} style={cardStyle}>
            {action}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ValidationCircuitSummarySection({
  panelSectionClassName,
  panelCardClassName,
  sectionStyle,
  cardStyle,
  circuitSummary,
  t,
}: {
  panelSectionClassName: string;
  panelCardClassName: string;
  sectionStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  circuitSummary: {
    netCount: number;
    resistorCount: number;
    circuitIssueCount: number;
  };
  t: Translator;
}) {
  return (
    <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
        <Sparkles size={11} className="text-[#60a5fa]" />
        {t('회로 요약', 'Circuit summary')}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500">넷 수</div>
          <div className="font-bold text-slate-200">{circuitSummary.netCount}</div>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500">저항 소자</div>
          <div className="font-bold text-slate-200">{circuitSummary.resistorCount}</div>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <div className={circuitSummary.circuitIssueCount > 0 ? 'font-bold text-[#fcd34d]' : 'font-bold text-[#86efac]'}>
            {circuitSummary.circuitIssueCount}
          </div>
          <div className="text-slate-500">회로 이슈</div>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">
        {t(
          '이제 리뷰 엔진이 단순 핀 매핑만 보지 않고, 연결된 넷과 저항 경로를 바탕으로 direct short와 분압 후 입력 전압도 같이 추정합니다.',
          'The review engine now estimates direct shorts and divided input voltages from real nets and resistor paths, not just pin mapping.'
        )}
      </p>
    </div>
  );
}

export function ValidationFormalSummarySection({
  panelSectionClassName,
  panelCardClassName,
  sectionStyle,
  cardStyle,
  formalSummary,
  t,
}: {
  panelSectionClassName: string;
  panelCardClassName: string;
  sectionStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  formalSummary: {
    analyzed: boolean;
    operationCount: number;
    issueCount: number;
  };
  t: Translator;
}) {
  return (
    <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
        <Code2 size={11} className="text-[#a78bfa]" />
        {t('코드-회로 검증', 'Code-to-circuit verification')}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500">분석 여부</div>
          <div className={formalSummary.analyzed ? 'font-bold text-[#86efac]' : 'font-bold text-slate-400'}>
            {formalSummary.analyzed ? '완료' : '대기'}
          </div>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500">코드 경로</div>
          <div className="font-bold text-slate-200">{formalSummary.operationCount}</div>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <div className="text-slate-500">형식 이슈</div>
          <div className={formalSummary.issueCount > 0 ? 'font-bold text-[#fcd34d]' : 'font-bold text-[#86efac]'}>
            {formalSummary.issueCount}
          </div>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">
        {t(
          '생성된 코드의 pinMode, digitalWrite, analogRead 호출을 읽어서 실제 배선된 센서 출력선이나 접지 넷과 충돌하는 실행 경로를 먼저 막습니다.',
          'This checks pinMode, digitalWrite, and analogRead calls against the real wiring so conflicting execution paths are caught early.'
        )}
      </p>
    </div>
  );
}

export function ValidationHardwareReviewHeader({
  panelSectionClassName,
  sectionStyle,
  importedCardStyle,
  importedMutedTextStyle,
  resolveTone,
  smartLinterGroups,
  severityFilter,
  setSeverityFilter,
  issueCount,
  t,
}: {
  panelSectionClassName: string;
  sectionStyle?: CSSProperties;
  importedCardStyle?: CSSProperties;
  importedMutedTextStyle?: CSSProperties;
  resolveTone: (severity: 'error' | 'warning' | 'info') => { labelKey: { ko: string; en: string } };
  smartLinterGroups: Array<{ id: string; label: string; count: number; tone: string; topIssue?: { title: string } | null }>;
  severityFilter: 'error' | 'warning' | 'info' | 'all';
  setSeverityFilter: (value: 'error' | 'warning' | 'info' | 'all') => void;
  issueCount: number;
  t: Translator;
  children: ReactNode;
}) {
  return (
    <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
        <AlertTriangle size={11} className="text-[#fbbf24]" />
        {t('실시간 하드웨어 리뷰', 'Real-time Hardware Review')}
      </div>
      {smartLinterGroups.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-2.5 py-2.5 space-y-2" style={importedCardStyle}>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={importedMutedTextStyle}>
            <ShieldAlert size={11} className="text-[#fbbf24]" />
            {t('핵심 린터', 'Smart linter')}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {smartLinterGroups.map(group => (
              <div
                key={group.id}
                className="rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-2"
                style={importedCardStyle}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-bold ${group.tone}`}>{group.label}</span>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                    {group.count}
                  </span>
                </div>
                {group.topIssue ? (
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-400" style={importedMutedTextStyle}>
                    {group.topIssue.title}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(['error', 'warning', 'info', 'all'] as const).map(level => {
          const isActive = severityFilter === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => setSeverityFilter(level)}
              className={`rounded border px-2 py-1 text-[10px] font-bold transition-colors ${
                isActive
                  ? 'border-sky-400/40 bg-sky-500/10 text-sky-200'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {level === 'all' ? t('전체', 'All') : pickSeverityLabel(resolveTone(level).labelKey, t)} {level === 'all' ? issueCount : null}
            </button>
          );
        })}
      </div>
      {/** children intentionally rendered by parent in a follow-up extraction */}
    </div>
  );
}

function pickSeverityLabel(labelKey: { ko: string; en: string }, t: Translator) {
  return t(labelKey.ko, labelKey.en);
}
