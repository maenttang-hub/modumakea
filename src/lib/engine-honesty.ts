import { pickLanguage } from '@/lib/ui-language';
import type { AppLanguage, ReviewEngineMeta } from '@/types';
import type { SpiceResult } from '@/lib/spice-simulator';

export function describeReviewEngineMeta(
  meta: ReviewEngineMeta | undefined,
  language: AppLanguage
) {
  if (!meta || meta.parserTier === 'none') {
    return {
      title: pickLanguage(language, {
        ko: '리뷰 엔진 정보 없음',
        en: 'Review engine info unavailable',
      }),
      body: pickLanguage(language, {
        ko: '아직 코드 리뷰가 실행되지 않았습니다.',
        en: 'Code review has not run yet.',
      }),
    };
  }

  const parserLabel =
    meta.parserTier === 'tree-sitter-ast'
      ? pickLanguage(language, {
          ko: 'Tree-sitter AST',
          en: 'Tree-sitter AST',
        })
      : meta.parserTier === 'structured-review'
        ? pickLanguage(language, {
            ko: '구조화 리뷰 파서',
            en: 'Structured review parser',
          })
        : pickLanguage(language, {
            ko: '패턴 기반 폴백 파서',
            en: 'Pattern-based fallback parser',
          });

  const languageLabel = meta.language === 'cpp'
    ? 'C++'
    : meta.language === 'python'
      ? 'Python'
      : pickLanguage(language, { ko: '코드', en: 'Code' });

  const body =
    meta.parserTier === 'tree-sitter-ast'
      ? pickLanguage(language, {
          ko: `${languageLabel}를 실제 Tree-sitter AST 기준으로 읽고 있습니다.`,
          en: `${languageLabel} is being analyzed with a real Tree-sitter AST pipeline.`,
        })
      : meta.parserTier === 'structured-review'
        ? pickLanguage(language, {
            ko: `${languageLabel}를 구조화된 리뷰 파서로 읽고 있습니다. 위험 경로 추적은 가능하지만, 아직 완전한 형식 증명 단계는 아닙니다.`,
            en: `${languageLabel} is being analyzed with a structured review parser. It can trace risky paths, but this is not yet a full formal-proof pipeline.`,
          })
        : pickLanguage(language, {
            ko: `${languageLabel}를 가벼운 패턴 파서로 읽고 있습니다. 빠른 리뷰에는 유용하지만, 복잡한 구문에서는 보수적으로 다시 확인해야 합니다.`,
            en: `${languageLabel} is being analyzed with a lightweight pattern parser. It is useful for fast review, but complex syntax still needs manual confirmation.`,
          });

  return {
    title: `${languageLabel} · ${parserLabel}`,
    body,
  };
}

export function describeSimulationEngine(result: SpiceResult | null, language: AppLanguage) {
  if (!result) {
    return {
      title: pickLanguage(language, {
        ko: '시뮬레이션 미실행',
        en: 'Simulation not run',
      }),
      body: pickLanguage(language, {
        ko: '아직 넷리스트 해석을 실행하지 않았습니다.',
        en: 'The netlist has not been simulated yet.',
      }),
    };
  }

  if (result.fidelity === 'solver-grade') {
    return {
      title: pickLanguage(language, {
        ko: 'DC 해석 경로',
        en: 'DC solve path',
      }),
      body: pickLanguage(language, {
        ko: '현재 결과는 실제 수치해석 경로로 계산된 DC 전압 요약입니다.',
        en: 'This result is a DC voltage summary produced by the current numerical solve path.',
      }),
    };
  }

  return {
    title: pickLanguage(language, {
      ko: '파형 미리보기 경로',
      en: 'Waveform preview path',
    }),
    body: pickLanguage(language, {
      ko: 'Transient/AC 파형은 아직 preview-grade입니다. RC companion 또는 DC 기반 근사치를 사용하므로, 실물급 SPICE 결과로 보기 전 최종 검토가 필요합니다.',
      en: 'Transient and AC waveforms are still preview-grade. They currently rely on RC companion or DC-derived approximations, so treat them as pre-SPICE review output rather than final physical truth.',
    }),
  };
}
