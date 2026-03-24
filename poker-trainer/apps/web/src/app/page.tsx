'use client';

import { useEffect, useMemo, useState } from 'react';

type AnalyzeResponse = {
  assumptions: {
    mode: 'single-opponent';
    playerCountReceived: number;
    playerCountApplied: number;
    rangeSource: 'preset' | 'text';
  };
  equity: {
    winRate: number;
    tieRate: number;
    loseRate: number;
    equity: number;
    sampleCount: number;
    mode: 'estimated';
  };
  hand: {
    madeHand: string;
    draws: string[];
    overcards: number;
    notes: string[];
  };
  futureHandDistribution: {
    distribution: Record<string, number>;
    sampleCount: number;
    mode: 'estimated';
  };
  recommendation: {
    action: 'fold' | 'check' | 'call' | 'raise';
    confidence: number;
    reasons: string[];
  };
  explanation: {
    headline: string;
    summary: string;
    strengths: string[];
    risks: string[];
    focus: string[];
    adjustments: {
      tighterRange: string;
      widerRange: string;
    };
  };
};

type RangePresetMeta = {
  name: string;
  label: string;
  description: string;
  width: '超宽' | '宽' | '中' | '紧';
  category: '宽度类' | '牌型认知类' | '风格导向类';
  representativeHands: string[];
  trainingHint: string;
};

type CompareResultItem = {
  presetName: string;
  label: string;
  equity: number;
  winRate: number;
  tieRate: number;
  loseRate: number;
};

type PickerTarget =
  | { area: 'hero'; index: 0 | 1 }
  | { area: 'board'; index: 0 | 1 | 2 | 3 | 4 };

type AccordionKey = 'draws' | 'explanation' | 'distribution' | 'compare' | 'assumptions';

const presetOptions = ['any-two', 'loose', 'standard', 'tight', 'premium', 'pocket-pairs', 'broadway', 'suited-aces', 'suited-connectors', 'suited-one-gappers', 'big-cards', 'suited-hands', 'value-heavy', 'speculative'] as const;
const validRanks = new Set(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);
const validSuits = new Set(['s', 'h', 'd', 'c']);
const rankOrder = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const suitOrder = ['s', 'h', 'd', 'c'] as const;

const modePresets = {
  quick: { label: '快速', iterations: '2000' },
  standard: { label: '标准', iterations: '5000' },
  deep: { label: '精细', iterations: '12000' },
} as const;

const exampleScenarios = {
  default: {
    label: '默认示例',
    heroHandInput: 'As Kd',
    boardInput: 'Qh Js 5d',
    rangePreset: 'standard' as const,
    rangeText: '',
    iterations: '5000',
    playerCount: '2',
    rngSeed: '1337',
  },
  premiumFlip: {
    label: 'AA 对 premium 范围',
    heroHandInput: 'As Ah',
    boardInput: '2c 7d 9h',
    rangePreset: 'premium' as const,
    rangeText: '',
    iterations: '5000',
    playerCount: '2',
    rngSeed: '42',
  },
  customRange: {
    label: '自定义范围示例',
    heroHandInput: 'As Kd',
    boardInput: 'Qh Js 5d',
    rangePreset: 'standard' as const,
    rangeText: 'TT+,AJs+,KQo',
    iterations: '5000',
    playerCount: '2',
    rngSeed: '7',
  },
};

function parseCardList(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cardListToInput(cards: string[]): string {
  return cards.filter(Boolean).join(' ');
}

function normalizeCardCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length !== 2) return trimmed;
  return `${trimmed[0]!.toUpperCase()}${trimmed[1]!.toLowerCase()}`;
}

function isValidCardCode(code: string): boolean {
  const normalized = normalizeCardCode(code);
  if (normalized.length !== 2) return false;
  return validRanks.has(normalized[0]!) && validSuits.has(normalized[1]!);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function actionLabel(action: AnalyzeResponse['recommendation']['action']): string {
  switch (action) {
    case 'raise':
      return '偏主动进攻';
    case 'call':
      return '偏继续跟注';
    case 'check':
      return '偏控制底池';
    case 'fold':
      return '偏向放弃';
    default:
      return action;
  }
}

function getActionTheme(action: AnalyzeResponse['recommendation']['action']) {
  if (action === 'raise') return { bg: 'linear-gradient(135deg, rgba(187,247,208,0.95), rgba(220,252,231,0.85))', fg: '#166534', pill: '#166534' };
  if (action === 'call') return { bg: 'linear-gradient(135deg, rgba(191,219,254,0.95), rgba(219,234,254,0.85))', fg: '#1d4ed8', pill: '#1d4ed8' };
  if (action === 'check') return { bg: 'linear-gradient(135deg, rgba(229,231,235,0.95), rgba(243,244,246,0.85))', fg: '#374151', pill: '#374151' };
  return { bg: 'linear-gradient(135deg, rgba(254,202,202,0.95), rgba(254,226,226,0.85))', fg: '#991b1b', pill: '#991b1b' };
}

function getEquityTone(equity: number): { label: string; color: string; bg: string } {
  if (equity >= 0.65) return { label: '明显领先', color: '#166534', bg: '#dcfce7' };
  if (equity >= 0.45) return { label: '可以继续', color: '#92400e', bg: '#fef3c7' };
  return { label: '偏弱谨慎', color: '#991b1b', bg: '#fee2e2' };
}

function getMadeHandLabel(value: string): string {
  const map: Record<string, string> = {
    'high-card': '高牌',
    'one-pair': '一对',
    'two-pair': '两对',
    'three-of-a-kind': '三条',
    straight: '顺子',
    flush: '同花',
    'full-house': '葫芦',
    'four-of-a-kind': '四条',
    'straight-flush': '同花顺',
  };
  return map[value] ?? value;
}

function getDrawLabel(value: string): string {
  const map: Record<string, string> = {
    'flush-draw': '同花听牌',
    oesd: '两头顺听牌',
    gutshot: '卡顺听牌',
    overcards: '高张优势',
    'combo-draw': '组合听牌',
  };
  return map[value] ?? value;
}

function getDistributionEntries(distribution: Record<string, number>) {
  return Object.entries(distribution)
    .filter(([_, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
}

function getDrawTagStyle(value: string): React.CSSProperties {
  if (value === 'combo-draw') return { background: '#ede9fe', color: '#6d28d9' };
  if (value === 'flush-draw') return { background: '#dbeafe', color: '#1d4ed8' };
  if (value === 'oesd') return { background: '#dcfce7', color: '#166534' };
  if (value === 'gutshot') return { background: '#fef3c7', color: '#92400e' };
  return { background: '#f3f4f6', color: '#374151' };
}

function getSuitSymbol(suit: string): string {
  return suit === 's' ? '♠' : suit === 'h' ? '♥' : suit === 'd' ? '♦' : '♣';
}

function getSuitColor(suit: string): string {
  return suit === 'h' || suit === 'd' ? '#b91c1c' : '#111827';
}

function getValidationState(heroCards: string[], boardCards: string[]) {
  const normalizedHero = heroCards.map(normalizeCardCode).filter(Boolean);
  const normalizedBoard = boardCards.map(normalizeCardCode).filter(Boolean);
  const allCards = [...normalizedHero, ...normalizedBoard];

  const invalidCards = allCards.filter((card) => !isValidCardCode(card));
  const duplicateCards = allCards.filter((card, index) => allCards.indexOf(card) !== index);

  const messages: string[] = [];

  if (normalizedHero.length !== 2) messages.push('Hero Hand 必须正好 2 张牌。');
  if (![0, 3, 4, 5].includes(normalizedBoard.length)) messages.push('Board 只能是 0 / 3 / 4 / 5 张牌。');
  if (invalidCards.length > 0) messages.push(`存在非法牌面编码：${Array.from(new Set(invalidCards)).join(', ')}`);
  if (duplicateCards.length > 0) messages.push(`存在重复牌：${Array.from(new Set(duplicateCards)).join(', ')}`);

  return {
    isValid: messages.length === 0,
    messages,
    normalizedHero,
    normalizedBoard,
  };
}

function getSummaryLine(result: AnalyzeResponse): string {
  if (result.hand.madeHand === 'high-card' && result.hand.draws.length === 0) return '当前还没成手，而且没有明显听牌，偏向谨慎处理。';
  if (result.hand.draws.includes('combo-draw')) return '虽然未必已经很强，但组合听牌让后续改良空间明显变大。';
  if (result.hand.madeHand !== 'high-card') return `当前已经形成${getMadeHandLabel(result.hand.madeHand)}，不是纯空气牌。`;
  return '当前主要价值来自听牌结构和后续街道的改良机会。';
}

function CardSlot({ value, label, onClick }: { value: string; label: string; onClick: () => void }) {
  const normalized = normalizeCardCode(value);
  const filled = isValidCardCode(normalized);
  const suit = filled ? normalized[1]! : '';

  return (
    <button type="button" onClick={onClick} style={cardSlotStyle}>
      <div style={cardSlotLabelStyle}>{label}</div>
      {filled ? (
        <div style={{ ...cardFaceStyle, color: getSuitColor(suit) }}>
          <span>{normalized[0]}</span>
          <span>{getSuitSymbol(suit)}</span>
        </div>
      ) : (
        <div style={emptyCardFaceStyle}>选择牌</div>
      )}
    </button>
  );
}


function MetricBubble({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricBubbleStyle}>
      <div style={metricBubbleLabelStyle}>{label}</div>
      <div style={metricBubbleValueStyle}>{value}</div>
    </div>
  );
}

function AccordionSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section style={accordionCardStyle}>
      <button type="button" onClick={onToggle} style={accordionHeaderStyle}>
        <div>
          <div style={accordionTitleStyle}>{title}</div>
          {subtitle ? <div style={accordionSubtitleStyle}>{subtitle}</div> : null}
        </div>
        <div style={accordionChevronStyle}>{open ? '－' : '＋'}</div>
      </button>
      {open ? <div style={accordionBodyStyle}>{children}</div> : null}
    </section>
  );
}

export default function HomePage() {
  const [heroHandInput, setHeroHandInput] = useState(exampleScenarios.default.heroHandInput);
  const [boardInput, setBoardInput] = useState(exampleScenarios.default.boardInput);
  const [rangePreset, setRangePreset] = useState<(typeof presetOptions)[number]>(exampleScenarios.default.rangePreset);
  const [rangeText, setRangeText] = useState(exampleScenarios.default.rangeText);
  const [rangePresets, setRangePresets] = useState<RangePresetMeta[]>([]);
  const [showAdvancedRange, setShowAdvancedRange] = useState(false);
  const [filterPocketPairs, setFilterPocketPairs] = useState(false);
  const [filterBroadway, setFilterBroadway] = useState(false);
  const [filterSuited, setFilterSuited] = useState(false);
  const [filterConnectors, setFilterConnectors] = useState(false);
  const [filterAces, setFilterAces] = useState(false);
  const [iterations, setIterations] = useState(exampleScenarios.default.iterations);
  const [playerCount, setPlayerCount] = useState(exampleScenarios.default.playerCount);
  const [rngSeed, setRngSeed] = useState(exampleScenarios.default.rngSeed);
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:8787');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [compareResults, setCompareResults] = useState<CompareResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerSuit, setPickerSuit] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [modePreset, setModePreset] = useState<keyof typeof modePresets>('standard');
  const [feedbackSubject, setFeedbackSubject] = useState('Poker Trainer 反馈');
  const [feedbackMessage, setFeedbackMessage] = useState('我想反馈的问题/建议：');
  const [openSection, setOpenSection] = useState<AccordionKey>('explanation');
  const [showLowFreqSettings, setShowLowFreqSettings] = useState(false);
  const [showMoreRanges, setShowMoreRanges] = useState(false);

  const heroPreview = useMemo(() => parseCardList(heroHandInput), [heroHandInput]);
  const boardPreview = useMemo(() => parseCardList(boardInput), [boardInput]);
  const validation = useMemo(() => getValidationState(heroPreview, boardPreview), [heroPreview, boardPreview]);
  const resultTone = result ? getEquityTone(result.equity.equity) : null;
  const actionTheme = result ? getActionTheme(result.recommendation.action) : null;
  const usedCards = useMemo(() => [...validation.normalizedHero, ...validation.normalizedBoard].filter(isValidCardCode), [validation.normalizedHero, validation.normalizedBoard]);

  useEffect(() => {
    let cancelled = false;
    async function loadRangePresets() {
      try {
        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/ranges/presets`);
        const data = await response.json();
        if (!response.ok) return;
        if (!cancelled && Array.isArray(data.presets)) setRangePresets(data.presets);
      } catch {
        // ignore
      }
    }
    loadRangePresets();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const currentRangePreset = useMemo(() => rangePresets.find((preset) => preset.name === rangePreset) ?? null, [rangePresets, rangePreset]);
  const quickRangePresets = useMemo(() => rangePresets.filter((preset) => ['any-two', 'standard', 'tight', 'premium', 'broadway', 'pocket-pairs', 'suited-aces', 'suited-connectors'].includes(preset.name)), [rangePresets]);

  const groupedRangePresets = useMemo(() => {
    const groups = { 宽度类: [] as RangePresetMeta[], 牌型认知类: [] as RangePresetMeta[], 风格导向类: [] as RangePresetMeta[] };
    for (const preset of rangePresets) groups[preset.category].push(preset);
    return groups;
  }, [rangePresets]);

  const comparePresetNames = ['standard', 'tight', 'premium', 'broadway', 'pocket-pairs'];
  const comparePresetMetas = useMemo(() => rangePresets.filter((preset) => comparePresetNames.includes(preset.name)), [rangePresets]);

  const filterRangeText = useMemo(() => {
    const tokens: string[] = [];
    if (filterPocketPairs) tokens.push('22+');
    if (filterBroadway) tokens.push('AKs,AQs,AJs,ATs,KQs,KJs,KTs,QJs,QTs,JTs,AKo,AQo,AJo,ATo,KQo,KJo,KTo,QJo,QTo,JTo');
    if (filterSuited) tokens.push('A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,82s+,72s+,62s+,52s+,42s+,32s');
    if (filterConnectors) tokens.push('98s,87s,76s,65s,54s');
    if (filterAces) tokens.push('A2s+,A2o+');
    return tokens.join(',');
  }, [filterPocketPairs, filterBroadway, filterSuited, filterConnectors, filterAces]);

  const usingFilterRange = Boolean(filterRangeText);
  const topThreeDistribution = useMemo(
    () => (result ? getDistributionEntries(result.futureHandDistribution.distribution).slice(0, 3) : []),
    [result],
  );

  function applyScenario(key: keyof typeof exampleScenarios) {
    const scenario = exampleScenarios[key];
    setHeroHandInput(scenario.heroHandInput);
    setBoardInput(scenario.boardInput);
    setRangePreset(scenario.rangePreset);
    setRangeText(scenario.rangeText);
    setIterations(scenario.iterations);
    setModePreset(scenario.iterations === '2000' ? 'quick' : scenario.iterations === '12000' ? 'deep' : 'standard');
    setPlayerCount(scenario.playerCount);
    setRngSeed(scenario.rngSeed);
    setResult(null);
    setCompareResults([]);
    setError(null);
    setPickerTarget(null);
    setPickerSuit(null);
    setOpenSection('explanation');
  }

  function clearSlot(target: PickerTarget) {
    if (target.area === 'hero') {
      const next = [...heroPreview];
      next[target.index] = '';
      setHeroHandInput(cardListToInput(next));
      return;
    }
    const next = [...boardPreview];
    next[target.index] = '';
    setBoardInput(cardListToInput(next.filter(Boolean)));
  }

  function applyCardToTarget(card: string) {
    if (!pickerTarget) return;
    if (pickerTarget.area === 'hero') {
      const next = [heroPreview[0] ?? '', heroPreview[1] ?? ''];
      next[pickerTarget.index] = card;
      setHeroHandInput(cardListToInput(next));
    } else {
      const next = [boardPreview[0] ?? '', boardPreview[1] ?? '', boardPreview[2] ?? '', boardPreview[3] ?? '', boardPreview[4] ?? ''];
      next[pickerTarget.index] = card;
      setBoardInput(cardListToInput(next.filter(Boolean)));
    }
    setPickerTarget(null);
    setPickerSuit(null);
  }

  function getPickerTargetLabel(target: PickerTarget | null) {
    if (!target) return '';
    return target.area === 'hero' ? `Hero 第 ${target.index + 1} 张` : `Board 第 ${target.index + 1} 张`;
  }

  function handleAccordionToggle(key: AccordionKey) {
    setOpenSection((current) => (current === key ? current : key));
  }

  function handleResetToFlop() {
    const preservedHero = [heroPreview[0] ?? '', heroPreview[1] ?? ''].filter(Boolean);
    const preservedFlop = [boardPreview[0] ?? '', boardPreview[1] ?? '', boardPreview[2] ?? ''].filter(Boolean);
    setHeroHandInput(cardListToInput(preservedHero));
    setBoardInput(cardListToInput(preservedFlop));
    setRangePreset('standard');
    setRangeText('');
    setFilterPocketPairs(false);
    setFilterBroadway(false);
    setFilterSuited(false);
    setFilterConnectors(false);
    setFilterAces(false);
    setShowAdvancedRange(false);
    setShowMoreRanges(false);
    setShowLowFreqSettings(false);
    setIterations(exampleScenarios.default.iterations);
    setModePreset('standard');
    setPlayerCount(exampleScenarios.default.playerCount);
    setRngSeed(exampleScenarios.default.rngSeed);
    setResult(null);
    setCompareResults([]);
    setError(null);
    setOpenSection('explanation');
  }

  function applyModePreset(mode: keyof typeof modePresets) {
    setModePreset(mode);
    setIterations(modePresets[mode].iterations);
  }

  async function handleAnalyze() {
    if (!validation.isValid) {
      setError(validation.messages[0] ?? '输入不合法');
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        heroHand: validation.normalizedHero,
        board: validation.normalizedBoard,
        rangePreset,
        rangeText: (filterRangeText || rangeText.trim()) || undefined,
        iterations: Number(iterations),
        rngSeed: Number(rngSeed),
        playerCount: Number(playerCount),
      };

      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Analyze request failed');
      setResult(data as AnalyzeResponse);

      if (!filterRangeText && !rangeText.trim()) {
        const comparePayloadBase = {
          heroHand: validation.normalizedHero,
          board: validation.normalizedBoard,
          iterations: Math.min(Number(iterations), 2500),
          rngSeed: Number(rngSeed),
          playerCount: Number(playerCount),
        };

        const compareResponses = await Promise.all(
          comparePresetMetas.map(async (preset) => {
            const resp = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/analyze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...comparePayloadBase, rangePreset: preset.name }),
            });
            const json = await resp.json();
            if (!resp.ok) throw new Error(json.error ?? `Compare request failed for ${preset.label}`);
            return {
              presetName: preset.name,
              label: preset.label,
              equity: json.equity.equity,
              winRate: json.equity.winRate,
              tieRate: json.equity.tieRate,
              loseRate: json.equity.loseRate,
            } as CompareResultItem;
          }),
        );
        setCompareResults(compareResponses.sort((a, b) => b.equity - a.equity));
      } else {
        setCompareResults([]);
      }
    } catch (err) {
      setResult(null);
      setCompareResults([]);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const rangeSourceCard = usingFilterRange ? (
    <div style={rangeInfoCardStyle}>
      <div style={rangeInfoTitleStyle}>分类筛选器生成范围</div>
      <div style={rangeInfoSubtitleStyle}>当前分析使用的是筛选器拼出的范围文本，会覆盖 preset。</div>
      <div style={rangeCodeBlockStyle}><code>{filterRangeText}</code></div>
    </div>
  ) : rangeText.trim() ? (
    <div style={rangeInfoCardStyle}>
      <div style={rangeInfoTitleStyle}>高级 Range Text</div>
      <div style={rangeInfoSubtitleStyle}>当前分析优先使用手工输入的范围文本。</div>
      <div style={rangeCodeBlockStyle}><code>{rangeText.trim()}</code></div>
    </div>
  ) : currentRangePreset ? (
    <div style={rangeInfoCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={rangeInfoTitleStyle}>{currentRangePreset.label}</div>
          <div style={rangeInfoSubtitleStyle}>{currentRangePreset.description}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...softBadgeStyle, background: '#eef2ff', color: '#4338ca' }}>{currentRangePreset.width}</span>
          <span style={{ ...softBadgeStyle, background: '#f8fafc', color: '#475569' }}>{currentRangePreset.category}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {currentRangePreset.representativeHands.map((hand) => (
          <span key={hand} style={{ ...softBadgeStyle, background: '#ffffff', color: '#111827' }}>{hand}</span>
        ))}
      </div>
      <div style={rangeHintLightStyle}><strong>训练提示：</strong>{currentRangePreset.trainingHint}</div>
    </div>
  ) : null;

  return (
    <main style={pageStyle}>
      <div style={orbAStyle} />
      <div style={orbBStyle} />
      <div style={shellStyle}>
        <header style={heroHeaderStyle}>
          <div style={heroHeaderTopBarStyle}>
            <div>
              <div style={eyebrowStyle}>单挑场景 · 快速训练</div>
              <h1 style={heroTitleStyle}>德州扑克单挑训练助手</h1>
              <p style={heroSubtitleStyle}>选好手牌、公共牌和对手范围，快速看到建议、胜率、当前牌型和关键记忆点。</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" style={ghostHeaderButtonStyle} onClick={() => setShowHelpModal(true)}>说明</button>
              <button type="button" style={ghostHeaderButtonStyle} onClick={() => setShowFeedbackModal(true)}>反馈</button>
            </div>
          </div>

        </header>

        <section style={workbenchStyle}>
          <aside style={leftPanelStyle}>
            <div style={glassCardStyle}>
              <div style={panelHeaderStyle}>
                <div>
                  <div style={panelEyebrowStyle}>Step 1</div>
                  <h2 style={panelTitleStyle}>输入工作台</h2>
                </div>
                <div style={panelHintStyle}>固定显示</div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={stepTopRowStyle}>
                  <div style={subSectionTitleStyle}>点牌器</div>
                  <div style={scenarioInlineStyle}>
                    <span style={scenarioLabelStyle}>快速示例</span>
                    {Object.entries(exampleScenarios).map(([key, item]) => (
                      <button key={key} onClick={() => applyScenario(key as keyof typeof exampleScenarios)} style={miniScenarioButtonStyle}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <div style={pickerLabelStyle}>Hero Hand</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <CardSlot value={heroPreview[0] ?? ''} label="H1" onClick={() => { setPickerTarget({ area: 'hero', index: 0 }); setPickerSuit(null); }} />
                      <CardSlot value={heroPreview[1] ?? ''} label="H2" onClick={() => { setPickerTarget({ area: 'hero', index: 1 }); setPickerSuit(null); }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                      <div style={pickerLabelStyle}>Board</div>
                      <button type="button" onClick={handleResetToFlop} style={miniGhostButtonStyle}>一键重置</button>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {([0, 1, 2, 3, 4] as const).map((index) => (
                        <div key={index} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                          <CardSlot value={boardPreview[index] ?? ''} label={`B${index + 1}`} onClick={() => { setPickerTarget({ area: 'board', index }); setPickerSuit(null); }} />
                          {(index === 3 || index === 4) && boardPreview[index] ? (
                            <button type="button" onClick={() => clearSlot({ area: 'board', index })} style={miniGhostButtonStyle}>
                              清除
                            </button>
                          ) : (
                            <div style={{ height: 30 }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={subSectionWrapStyle}>
                <div style={subSectionTitleStyle}>常用范围</div>
                <div style={chipWrapStyle}>
                  {(quickRangePresets.length > 0 ? quickRangePresets.slice(0, 5) : presetOptions.slice(0, 5).map((name) => ({ name, label: name } as RangePresetMeta))).map((preset) => {
                    const active = !rangeText.trim() && !usingFilterRange && rangePreset === preset.name;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setRangePreset(preset.name as (typeof presetOptions)[number]);
                          setRangeText('');
                          setFilterPocketPairs(false);
                          setFilterBroadway(false);
                          setFilterSuited(false);
                          setFilterConnectors(false);
                          setFilterAces(false);
                        }}
                        style={{ ...pillButtonStyle, ...(active ? pillButtonActiveStyle : {}) }}
                        title={quickRangePresets.length > 0 && 'description' in preset ? `${preset.label}：${preset.description}\n训练提示：${preset.trainingHint}` : preset.label}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!validation.isValid ? (
                <div style={{ ...warningNoticeStyle, background: '#fff7ed', borderColor: '#fdba74', color: '#9a3412' }}>
                  <strong>输入还没准备好：</strong>
                  <ul style={listStyle}>
                    {validation.messages.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </div>
              ) : (
                <div style={{ ...warningNoticeStyle, background: '#ecfdf5', borderColor: '#86efac', color: '#166534' }}>输入格式看起来没问题，可以直接分析。</div>
              )}

              <div style={subSectionWrapStyle}>
                <div style={subSectionTitleStyle}>分析模式</div>
                <div style={chipWrapStyle}>
                  {Object.entries(modePresets).map(([key, item]) => (
                    <button key={key} type="button" onClick={() => applyModePreset(key as keyof typeof modePresets)} style={{ ...pillButtonStyle, ...(modePreset === key ? pillButtonActiveStyle : {}) }}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div style={helperTextStyle}>快速：更轻量；标准：默认训练；精细：更稳但更慢。</div>
              </div>

              <div style={stickyActionWrapStyle}>
                <button onClick={handleAnalyze} disabled={loading || !validation.isValid} style={primaryActionStyle}>
                  {loading ? '分析中…' : '开始分析'}
                </button>
              </div>

              {error ? <div style={{ ...warningNoticeStyle, background: '#fff1f2', borderColor: '#fda4af', color: '#be123c' }}>{error}</div> : null}

              <div style={advancedRangePanelStyle}>
                <button type="button" onClick={() => setShowMoreRanges((value) => !value)} style={advancedRangeToggleStyle}>
                  <span>更多范围（按分类）</span>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{showMoreRanges ? '收起' : '展开'}</span>
                </button>
                {showMoreRanges ? (
                  <div style={advancedRangeBodyStyle}>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {Object.entries(groupedRangePresets).map(([groupName, presets]) => (
                        <div key={groupName}>
                          <div style={rangeGroupTitleStyle}>{groupName}</div>
                          <div style={chipWrapStyle}>
                            {presets.map((preset) => {
                              const active = !rangeText.trim() && !usingFilterRange && rangePreset === preset.name;
                              return (
                                <button
                                  key={preset.name}
                                  type="button"
                                  onClick={() => {
                                    setRangePreset(preset.name as (typeof presetOptions)[number]);
                                    setRangeText('');
                                    setFilterPocketPairs(false);
                                    setFilterBroadway(false);
                                    setFilterSuited(false);
                                    setFilterConnectors(false);
                                    setFilterAces(false);
                                  }}
                                  style={{ ...pillButtonStyle, ...(active ? pillButtonActiveStyle : {}) }}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={subSectionWrapStyle}>
                <div style={subSectionTitleStyle}>分类筛选器</div>
                <div style={chipWrapStyle}>
                  {[
                    ['口袋对子', filterPocketPairs, setFilterPocketPairs],
                    ['百老汇牌', filterBroadway, setFilterBroadway],
                    ['同花牌', filterSuited, setFilterSuited],
                    ['同花连张', filterConnectors, setFilterConnectors],
                    ['A牌结构', filterAces, setFilterAces],
                  ].map(([label, active, setter]) => (
                    <button
                      key={label as string}
                      type="button"
                      onClick={() => {
                        (setter as React.Dispatch<React.SetStateAction<boolean>>)((value) => !value);
                        setRangeText('');
                      }}
                      style={{ ...pillButtonStyle, ...(active ? pillButtonActiveStyle : {}) }}
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
                <div style={helperTextStyle}>{usingFilterRange ? <>当前筛选生成：<code>{filterRangeText}</code></> : '未启用筛选器时，当前按 preset 或高级输入分析。'}</div>
              </div>

              <div style={advancedRangePanelStyle}>
                <button type="button" onClick={() => setShowAdvancedRange((value) => !value)} style={advancedRangeToggleStyle}>
                  <span>高级范围输入</span>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{showAdvancedRange ? '收起' : '展开'}</span>
                </button>
                {showAdvancedRange ? (
                  <div style={advancedRangeBodyStyle}>
                    <label style={labelStyle}>
                      Range Text（填写后优先于 preset）
                      <input style={inputStyle} value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="TT+,AJs+,KQo" />
                    </label>
                    <div style={helperTextStyle}>示例：<code>TT+</code>、<code>AJs+</code>、<code>KQo</code>、<code>76s-54s</code></div>
                  </div>
                ) : null}
              </div>

              {rangeSourceCard}

              <div style={advancedRangePanelStyle}>
                <button type="button" onClick={() => setShowLowFreqSettings((value) => !value)} style={advancedRangeToggleStyle}>
                  <span>低频设置与备用输入</span>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{showLowFreqSettings ? '收起' : '展开'}</span>
                </button>
                {showLowFreqSettings ? (
                  <div style={advancedRangeBodyStyle}>
                    <div style={inputGroupStyle}>
                      <label style={labelStyle}>
                        API Base URL
                        <input style={inputStyle} value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
                      </label>
                      <label style={labelStyle}>
                        Hero Hand（文本 fallback）
                        <input style={inputStyle} value={heroHandInput} onChange={(e) => setHeroHandInput(e.target.value)} placeholder="As Kd" />
                      </label>
                      <label style={labelStyle}>
                        Board（文本 fallback）
                        <input style={inputStyle} value={boardInput} onChange={(e) => setBoardInput(e.target.value)} placeholder="Qh Js 5d" />
                      </label>
                      <label style={labelStyle}>
                        Iterations
                        <input style={inputStyle} value={iterations} onChange={(e) => setIterations(e.target.value)} />
                      </label>
                      <label style={labelStyle}>
                        RNG Seed
                        <input style={inputStyle} value={rngSeed} onChange={(e) => setRngSeed(e.target.value)} />
                      </label>
                      <label style={labelStyle}>
                        Player Count（只读展示）
                        <input style={{ ...inputStyle, background: 'rgba(248,250,252,0.8)', color: '#64748b' }} value={playerCount} readOnly />
                      </label>
                    </div>
                    <div style={softNoticeStyle}>当前分析仍固定按 <strong>单对手（2 人）</strong> 计算；这里放的是低频设置和备用输入。</div>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <section style={rightPanelStyle}>
            <div style={{ ...heroResultCardStyle, background: actionTheme?.bg ?? 'linear-gradient(135deg, rgba(255,255,255,0.86), rgba(238,242,255,0.78))', color: actionTheme?.fg ?? '#111827' }}>
              <div style={panelHeaderStyle}>
                <div>
                  <div style={panelEyebrowStyle}>Step 2</div>
                  <h2 style={panelTitleStyle}>核心结果</h2>
                </div>
                {result ? <div style={{ ...actionPillStyle, background: actionTheme?.pill }}>{actionLabel(result.recommendation.action)}</div> : <div style={panelHintStyle}>第一页固定显示</div>}
              </div>

              <div style={heroMainDecisionStyle}>{result ? actionLabel(result.recommendation.action) : '等待分析'}</div>
              <div style={heroDecisionSubStyle}>
                {result ? `${result.explanation.headline} 当前 equity ${pct(result.equity.equity)}，整体属于 ${resultTone?.label}。` : '先完成左侧输入，再点击开始分析。第一屏只保留最重要的结论。'}
              </div>

              <div style={memoryLineStyle}>
                <strong>记忆点：</strong>{result ? getSummaryLine(result) : '分析后这里会给出一句便于记忆的训练摘要。'}
              </div>

              <div style={coreMetricsRowStyle}>
                <MetricBubble label="行动建议" value={result ? actionLabel(result.recommendation.action) : '—'} />
                <MetricBubble label="Equity" value={result ? pct(result.equity.equity) : '—'} />
                <MetricBubble label="当前牌型" value={result ? getMadeHandLabel(result.hand.madeHand) : '—'} />
                <MetricBubble label="一句记忆点" value={result ? getSummaryLine(result) : '—'} />
              </div>

              <div style={topThreeCardStyle}>
                <div style={miniLabelStyle}>最可能的最终牌型（Top 3）</div>
                {result ? (
                  <div style={topThreeListStyle}>
                    {topThreeDistribution.map(([category, value], index) => (
                      <div key={category} style={topThreeItemStyle}>
                        <div style={topThreeRankStyle}>#{index + 1}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={topThreeNameStyle}>{getMadeHandLabel(category)}</div>
                          <div style={topThreeValueStyle}>{pct(value)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={emptyTextStyle}>分析后这里会先展示最有可能出现的前三种最终牌型。</div>
                )}
              </div>
            </div>

            <div style={accordionStackStyle}>
              <AccordionSection title="牌力与听牌" subtitle="查看当前 made hand、draws 与 notes" open={openSection === 'draws'} onToggle={() => handleAccordionToggle('draws')}>
                {result ? (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div>
                      <div style={miniLabelStyle}>当前牌型</div>
                      <div style={madeHandBadgeStyle}>{getMadeHandLabel(result.hand.madeHand)}</div>
                    </div>
                    <div>
                      <div style={miniLabelStyle}>听牌标签</div>
                      <div style={tagWrapStyle}>
                        {result.hand.draws.length > 0 ? result.hand.draws.map((draw) => <span key={draw} style={{ ...drawTagStyle, ...getDrawTagStyle(draw) }}>{getDrawLabel(draw)}</span>) : <span style={{ ...drawTagStyle, background: '#f3f4f6', color: '#6b7280' }}>无明显听牌</span>}
                      </div>
                    </div>
                    <div>
                      <div style={miniLabelStyle}>Notes</div>
                      <div style={stackListStyle}>{result.hand.notes.map((note) => <div key={note} style={softListItemStyle}>{note}</div>)}</div>
                    </div>
                  </div>
                ) : <div style={emptyTextStyle}>分析后这里会显示 made hand、听牌与附加 notes。</div>}
              </AccordionSection>

              <AccordionSection title="教练解释" subtitle="默认展开，保留训练价值" open={openSection === 'explanation'} onToggle={() => handleAccordionToggle('explanation')}>
                {result ? (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div>
                      <div style={miniLabelStyle}>建议原因</div>
                      <div style={stackListStyle}>{result.recommendation.reasons.map((reason) => <div key={reason} style={softListItemStyle}>{reason}</div>)}</div>
                    </div>
                    <div>
                      <div style={miniLabelStyle}>当前优势</div>
                      <div style={stackListStyle}>{result.explanation.strengths.map((item) => <div key={item} style={{ ...softInsightStyle, background: '#ecfdf5', color: '#166534' }}>{item}</div>)}</div>
                    </div>
                    <div>
                      <div style={miniLabelStyle}>当前风险</div>
                      <div style={stackListStyle}>{result.explanation.risks.map((item) => <div key={item} style={{ ...softInsightStyle, background: '#fff1f2', color: '#be123c' }}>{item}</div>)}</div>
                    </div>
                    <div>
                      <div style={miniLabelStyle}>训练重点</div>
                      <div style={stackListStyle}>{result.explanation.focus.map((item) => <div key={item} style={{ ...softInsightStyle, background: '#eff6ff', color: '#1d4ed8' }}>{item}</div>)}</div>
                    </div>

                    <div>
                      <div style={miniLabelStyle}>范围变化提醒</div>
                      <div style={stackListStyle}>
                        <div style={{ ...softInsightStyle, background: '#faf5ff', color: '#7c3aed' }}><strong>如果对手更紧：</strong>{result.explanation.adjustments.tighterRange}</div>
                        <div style={{ ...softInsightStyle, background: '#eff6ff', color: '#1d4ed8' }}><strong>如果对手更宽：</strong>{result.explanation.adjustments.widerRange}</div>
                      </div>
                    </div>
                  </div>
                ) : <div style={emptyTextStyle}>分析后这里会显示教练式解释。</div>}
              </AccordionSection>

              <AccordionSection title="最终牌型分布" subtitle="未来成牌概率" open={openSection === 'distribution'} onToggle={() => handleAccordionToggle('distribution')}>
                {result ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {getDistributionEntries(result.futureHandDistribution.distribution).map(([category, value]) => (
                      <div key={category} style={barGroupStyle}>
                        <div style={barHeaderStyle}><span>{getMadeHandLabel(category)}</span><strong>{pct(value)}</strong></div>
                        <div style={barTrackStyle}><div style={{ ...barFillStyle, width: pct(value), background: 'linear-gradient(90deg, #2dd4bf, #14b8a6)' }} /></div>
                      </div>
                    ))}
                    <div style={helperTextStyle}>采样数：{result.futureHandDistribution.sampleCount.toLocaleString()}（Monte Carlo 估算）</div>
                  </div>
                ) : <div style={emptyTextStyle}>分析后这里会显示最终牌型分布。</div>}
              </AccordionSection>

              <AccordionSection title="范围对比" subtitle="仅 preset 模式下开启" open={openSection === 'compare'} onToggle={() => handleAccordionToggle('compare')}>
                {result ? compareResults.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {compareResults.map((item) => (
                      <div key={item.presetName} style={compareRowStyle}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{item.label}</div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>Win {pct(item.winRate)} · Tie {pct(item.tieRate)} · Lose {pct(item.loseRate)}</div>
                        </div>
                        <div style={compareBarCellStyle}><div style={barTrackStyle}><div style={{ ...barFillStyle, width: pct(item.equity), background: 'linear-gradient(90deg, #a78bfa, #8b5cf6)' }} /></div></div>
                        <div style={compareValueStyle}>{pct(item.equity)}</div>
                      </div>
                    ))}
                  </div>
                ) : <div style={emptyTextStyle}>启用分类筛选器或高级 Range Text 时，这个模块会关闭，避免和手工定义范围冲突。</div> : <div style={emptyTextStyle}>分析后这里会显示常见范围对比。</div>}
              </AccordionSection>

              <AccordionSection title="当前分析假设" subtitle="查看 rangeSource / playerCount 等底层假设" open={openSection === 'assumptions'} onToggle={() => handleAccordionToggle('assumptions')}>
                {result ? (
                  <div style={assumptionGridStyle}>
                    <div style={assumptionItemStyle}><span>mode</span><strong>{result.assumptions.mode}</strong></div>
                    <div style={assumptionItemStyle}><span>rangeSource</span><strong>{result.assumptions.rangeSource}</strong></div>
                    <div style={assumptionItemStyle}><span>received</span><strong>{result.assumptions.playerCountReceived}</strong></div>
                    <div style={assumptionItemStyle}><span>applied</span><strong>{result.assumptions.playerCountApplied}</strong></div>
                  </div>
                ) : <div style={emptyTextStyle}>分析后这里会显示当前假设。</div>}
              </AccordionSection>
            </div>
          </section>
        </section>
      </div>

      {showHelpModal ? (
        <div style={modalOverlayStyle} onClick={() => setShowHelpModal(false)}>
          <div style={infoModalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderRowStyle}>
              <div>
                <div style={modalTitleStyle}>说明</div>
                <div style={modalSubtitleStyle}>当前页面改成工作台布局，核心结果固定在第一页。</div>
              </div>
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowHelpModal(false)}>关闭</button>
            </div>
            <div style={modalContentBlockStyle}><p style={modalParagraphStyle}>左侧负责输入，右侧负责结果；只有最关键的四项默认露出，其他内容都通过折叠面板按需查看。</p></div>
          </div>
        </div>
      ) : null}

      {showFeedbackModal ? (
        <div style={modalOverlayStyle} onClick={() => setShowFeedbackModal(false)}>
          <div style={infoModalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderRowStyle}>
              <div>
                <div style={modalTitleStyle}>反馈</div>
                <div style={modalSubtitleStyle}>会通过你的默认邮件客户端发送</div>
              </div>
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowFeedbackModal(false)}>关闭</button>
            </div>
            <label style={labelStyle}>收件人<input style={inputStyle} value="cq.fanlingzhi@gmail.com" readOnly /></label>
            <label style={labelStyle}>主题<input style={inputStyle} value={feedbackSubject} onChange={(e) => setFeedbackSubject(e.target.value)} /></label>
            <label style={labelStyle}>内容<textarea style={textareaStyle} value={feedbackMessage} onChange={(e) => setFeedbackMessage(e.target.value)} /></label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowFeedbackModal(false)}>取消</button>
              <a href={`mailto:cq.fanlingzhi@gmail.com?subject=${encodeURIComponent(feedbackSubject)}&body=${encodeURIComponent(feedbackMessage)}`} style={primaryLinkButtonStyle}>打开邮件客户端发送</a>
            </div>
          </div>
        </div>
      ) : null}

      {pickerTarget ? (
        <div style={modalOverlayStyle} onClick={() => { setPickerTarget(null); setPickerSuit(null); }}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>选择牌面</div>
                <div style={{ color: '#666', fontSize: 13 }}>正在选择：{getPickerTargetLabel(pickerTarget)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={secondaryButtonStyle} onClick={() => clearSlot(pickerTarget)}>清空这个位置</button>
                <button type="button" style={secondaryButtonStyle} onClick={() => { setPickerTarget(null); setPickerSuit(null); }}>关闭</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={pickerStageTitleStyle}>第一步：先选花色</div>
                <div style={suitGridStyle}>
                  {suitOrder.map((suit) => (
                    <button key={suit} type="button" onClick={() => setPickerSuit(suit)} style={{ ...suitButtonStyle, color: getSuitColor(suit), borderColor: pickerSuit === suit ? '#2563eb' : '#d1d5db', background: pickerSuit === suit ? '#eff6ff' : '#fff' }}>
                      <span style={{ fontSize: 24 }}>{getSuitSymbol(suit)}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{suit === 's' ? '黑桃' : suit === 'h' ? '红桃' : suit === 'd' ? '方块' : '梅花'}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={pickerStageTitleStyle}>第二步：再选点数</div>
                <div style={rankGridStyle}>
                  {rankOrder.map((rank) => {
                    const candidate = pickerSuit ? `${rank}${pickerSuit}` : '';
                    const currentValue = pickerTarget.area === 'hero' ? heroPreview[pickerTarget.index] ?? '' : boardPreview[pickerTarget.index] ?? '';
                    const isCurrent = candidate && normalizeCardCode(currentValue) === candidate;
                    const isUsedElsewhere = candidate ? usedCards.includes(candidate) && !isCurrent : false;
                    const disabled = !pickerSuit || isUsedElsewhere;
                    return (
                      <button key={rank} type="button" disabled={disabled} onClick={() => pickerSuit && applyCardToTarget(candidate)} style={{ ...rankButtonStyle, background: isUsedElsewhere ? '#e5e7eb' : isCurrent ? '#eff6ff' : pickerSuit ? '#fff' : '#f9fafb', color: pickerSuit ? getSuitColor(pickerSuit) : '#9ca3af', borderColor: isCurrent ? '#2563eb' : '#d1d5db', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                        <span style={{ fontSize: 20, fontWeight: 800 }}>{rank}</span>
                        <span style={{ fontSize: 18 }}>{pickerSuit ? getSuitSymbol(pickerSuit) : '·'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>已占用牌会以灰色禁用展示，不可被选中。先选花色，再选点数。</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #fdf2f8 0%, #eff6ff 48%, #f8fafc 100%)',
  position: 'relative',
  overflow: 'hidden',
};

const orbAStyle: React.CSSProperties = {
  position: 'fixed', top: -120, right: -90, width: 280, height: 280, borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(244,114,182,0.22), rgba(244,114,182,0))', pointerEvents: 'none',
};
const orbBStyle: React.CSSProperties = {
  position: 'fixed', left: -80, bottom: -120, width: 320, height: 320, borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(96,165,250,0.22), rgba(96,165,250,0))', pointerEvents: 'none',
};
const shellStyle: React.CSSProperties = { maxWidth: 1440, margin: '0 auto', padding: 24, position: 'relative', zIndex: 1 };
const heroHeaderStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.62)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: 28,
  padding: '18px 24px', marginBottom: 14, boxShadow: '0 18px 60px rgba(148,163,184,0.16)', maxWidth: 1180
};
const heroHeaderTopBarStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' };
const eyebrowStyle: React.CSSProperties = { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: 'rgba(79,70,229,0.08)', color: '#4338ca', fontWeight: 700, fontSize: 12, marginBottom: 10 };
const heroTitleStyle: React.CSSProperties = { margin: '0 0 6px 0', fontSize: 30, color: '#0f172a' };
const heroSubtitleStyle: React.CSSProperties = { margin: 0, color: '#475569', lineHeight: 1.65, maxWidth: 760 };
const ghostHeaderButtonStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 999, border: '1px solid rgba(203,213,225,0.9)', background: 'rgba(255,255,255,0.72)', cursor: 'pointer', fontWeight: 700 };
const scenarioStripStyle: React.CSSProperties = { marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const scenarioLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#64748b', marginRight: 4 };
const chipButtonStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 999, border: '1px solid rgba(203,213,225,0.9)', background: 'rgba(255,255,255,0.86)', cursor: 'pointer', fontWeight: 700, boxShadow: '0 8px 20px rgba(148,163,184,0.08)' };
const stepTopRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 };
const scenarioInlineStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' };
const miniScenarioButtonStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(203,213,225,0.9)', background: 'rgba(255,255,255,0.86)', cursor: 'pointer', fontWeight: 700, fontSize: 12, boxShadow: '0 6px 16px rgba(148,163,184,0.08)' };
const workbenchStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(500px, 580px) minmax(0, 1fr)', gap: 18, alignItems: 'start' };
const leftPanelStyle: React.CSSProperties = { position: 'sticky', top: 18, alignSelf: 'start' };
const rightPanelStyle: React.CSSProperties = { display: 'grid', gap: 18 };
const glassCardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.62)', backdropFilter: 'blur(18px)', borderRadius: 28, border: '1px solid rgba(255,255,255,0.72)', padding: 20, boxShadow: '0 18px 60px rgba(148,163,184,0.16)' };
const panelHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' };
const panelEyebrowStyle: React.CSSProperties = { fontSize: 12, color: '#8b5cf6', fontWeight: 800, marginBottom: 6 };
const panelTitleStyle: React.CSSProperties = { margin: 0, fontSize: 22, color: '#0f172a' };
const panelHintStyle: React.CSSProperties = { color: '#64748b', fontSize: 13, fontWeight: 700 };
const subSectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 8 };
const subSectionWrapStyle: React.CSSProperties = { marginTop: 18 };
const inputGroupStyle: React.CSSProperties = { display: 'grid', gap: 12, marginTop: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 700, color: '#334155' };
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, padding: '12px 14px', borderRadius: 16, border: '1px solid rgba(203,213,225,0.9)', background: 'rgba(255,255,255,0.88)', fontSize: 14, boxSizing: 'border-box', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)' };
const chipWrapStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const pillButtonStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 999, border: '1px solid rgba(203,213,225,0.95)', background: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#334155' };
const pillButtonActiveStyle: React.CSSProperties = { background: 'linear-gradient(135deg, #111827, #334155)', color: '#fff', borderColor: '#111827' };
const helperTextStyle: React.CSSProperties = { marginTop: 8, fontSize: 12, color: '#64748b', lineHeight: 1.7 };
const advancedRangePanelStyle: React.CSSProperties = { marginTop: 18, border: '1px solid rgba(226,232,240,0.95)', borderRadius: 20, background: 'rgba(255,255,255,0.58)', overflow: 'hidden' };
const advancedRangeToggleStyle: React.CSSProperties = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, cursor: 'pointer', textAlign: 'left' };
const advancedRangeBodyStyle: React.CSSProperties = { padding: '0 16px 16px 16px', borderTop: '1px solid rgba(226,232,240,0.9)' };
const rangeInfoCardStyle: React.CSSProperties = { marginTop: 18, padding: 16, borderRadius: 22, background: 'rgba(255,255,255,0.74)', border: '1px solid rgba(226,232,240,0.95)', boxShadow: '0 10px 24px rgba(148,163,184,0.08)' };
const rangeInfoTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 900, color: '#0f172a' };
const rangeInfoSubtitleStyle: React.CSSProperties = { marginTop: 4, fontSize: 13, color: '#64748b', lineHeight: 1.65 };
const rangeCodeBlockStyle: React.CSSProperties = { marginTop: 12, padding: '12px 14px', borderRadius: 16, background: '#111827', color: '#f8fafc', border: '1px solid #374151', overflowX: 'auto', wordBreak: 'break-all', fontSize: 13 };
const softBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '7px 10px', borderRadius: 999, border: '1px solid rgba(226,232,240,0.95)', fontSize: 12, fontWeight: 800 };
const rangeHintLightStyle: React.CSSProperties = { marginTop: 12, padding: '10px 12px', borderRadius: 14, background: '#eff6ff', color: '#1d4ed8', fontSize: 13, lineHeight: 1.65 };
const softNoticeStyle: React.CSSProperties = { marginTop: 16, padding: '12px 14px', borderRadius: 16, background: 'rgba(248,250,252,0.92)', border: '1px solid rgba(203,213,225,0.92)', color: '#475569', lineHeight: 1.65 };
const warningNoticeStyle: React.CSSProperties = { marginTop: 14, padding: '12px 14px', borderRadius: 16, border: '1px solid', lineHeight: 1.65 };
const listStyle: React.CSSProperties = { paddingLeft: 18, margin: '8px 0 0 0' };
const primaryActionStyle: React.CSSProperties = { width: '100%', padding: '15px 18px', borderRadius: 20, border: 'none', background: 'linear-gradient(135deg, #111827, #4338ca)', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 18px 36px rgba(67,56,202,0.22)' };
const stickyActionWrapStyle: React.CSSProperties = { position: 'sticky', top: 12, zIndex: 3, marginTop: 14, marginBottom: 4, display: 'grid', gap: 10 };
const secondaryActionStyle: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 18, border: '1px solid rgba(203,213,225,0.95)', background: 'rgba(255,255,255,0.86)', color: '#334155', fontSize: 14, fontWeight: 800, cursor: 'pointer' };
const miniGhostButtonStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(203,213,225,0.95)', background: 'rgba(255,255,255,0.9)', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const heroResultCardStyle: React.CSSProperties = { borderRadius: 30, padding: 22, border: '1px solid rgba(255,255,255,0.72)', backdropFilter: 'blur(18px)', boxShadow: '0 18px 60px rgba(148,163,184,0.16)' };
const actionPillStyle: React.CSSProperties = { color: '#fff', padding: '9px 14px', borderRadius: 999, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' };
const heroMainDecisionStyle: React.CSSProperties = { fontSize: 34, fontWeight: 900, marginBottom: 8 };
const heroDecisionSubStyle: React.CSSProperties = { fontSize: 15, lineHeight: 1.75, maxWidth: 760, opacity: 0.92 };
const memoryLineStyle: React.CSSProperties = { marginTop: 16, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(255,255,255,0.68)', lineHeight: 1.7 };
const coreMetricsRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 16 };
const metricBubbleStyle: React.CSSProperties = { padding: '16px 14px', borderRadius: 22, background: 'rgba(255,255,255,0.62)', border: '1px solid rgba(255,255,255,0.72)', minHeight: 112, display: 'grid', gap: 8, alignContent: 'start' };
const metricBubbleLabelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.72, fontWeight: 700 };
const metricBubbleValueStyle: React.CSSProperties = { fontSize: 18, fontWeight: 900, lineHeight: 1.45, wordBreak: 'break-word' };
const topThreeCardStyle: React.CSSProperties = { marginTop: 14, padding: '14px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.58)', border: '1px solid rgba(255,255,255,0.72)' };
const topThreeListStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 };
const topThreeItemStyle: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', padding: '12px 12px', borderRadius: 16, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(226,232,240,0.92)' };
const topThreeRankStyle: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #c4b5fd, #93c5fd)', color: '#1f2937', fontWeight: 900, fontSize: 13, flexShrink: 0 };
const topThreeNameStyle: React.CSSProperties = { fontWeight: 800, color: '#0f172a', marginBottom: 2 };
const topThreeValueStyle: React.CSSProperties = { fontSize: 13, color: '#475569', fontWeight: 700 };
const accordionStackStyle: React.CSSProperties = { display: 'grid', gap: 12 };
const accordionCardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.66)', backdropFilter: 'blur(14px)', borderRadius: 24, border: '1px solid rgba(255,255,255,0.72)', boxShadow: '0 12px 28px rgba(148,163,184,0.12)' };
const accordionHeaderStyle: React.CSSProperties = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 18px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' };
const accordionTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 900, color: '#0f172a' };
const accordionSubtitleStyle: React.CSSProperties = { marginTop: 4, fontSize: 12, color: '#64748b' };
const accordionChevronStyle: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(226,232,240,0.9)', color: '#475569', fontSize: 18, fontWeight: 700 };
const accordionBodyStyle: React.CSSProperties = { padding: '0 18px 18px 18px' };
const miniLabelStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 700 };
const madeHandBadgeStyle: React.CSSProperties = { display: 'inline-block', background: 'linear-gradient(135deg, #111827, #334155)', color: '#fff', borderRadius: 999, padding: '8px 12px', fontWeight: 800, fontSize: 13 };
const tagWrapStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const drawTagStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '8px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800 };
const stackListStyle: React.CSSProperties = { display: 'grid', gap: 10 };
const softListItemStyle: React.CSSProperties = { padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)', color: '#334155', lineHeight: 1.65 };
const softInsightStyle: React.CSSProperties = { padding: '12px 14px', borderRadius: 16, lineHeight: 1.65, fontWeight: 600 };
const barGroupStyle: React.CSSProperties = { display: 'grid', gap: 6, marginBottom: 10 };
const barHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151' };
const barTrackStyle: React.CSSProperties = { height: 10, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' };
const barFillStyle: React.CSSProperties = { height: '100%', borderRadius: 999 };
const compareRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) minmax(120px,220px) 72px', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 16, background: 'rgba(245,243,255,0.88)', border: '1px solid rgba(221,214,254,0.95)' };
const compareBarCellStyle: React.CSSProperties = { minWidth: 120 };
const compareValueStyle: React.CSSProperties = { fontWeight: 900, color: '#6d28d9', textAlign: 'right' };
const assumptionGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const assumptionItemStyle: React.CSSProperties = { padding: '12px 14px', borderRadius: 16, background: 'rgba(248,250,252,0.96)', border: '1px solid rgba(226,232,240,0.95)', display: 'grid', gap: 4, fontSize: 13, color: '#475569' };
const emptyTextStyle: React.CSSProperties = { color: '#64748b', lineHeight: 1.75, fontSize: 14 };
const pickerLabelStyle: React.CSSProperties = { fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 800 };
const cardSlotStyle: React.CSSProperties = { width: 72, borderRadius: 18, border: '1px solid rgba(203,213,225,0.95)', background: 'rgba(255,255,255,0.86)', padding: 8, cursor: 'pointer', boxShadow: '0 8px 20px rgba(148,163,184,0.08)' };
const cardSlotLabelStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginBottom: 6 };
const cardFaceStyle: React.CSSProperties = { minHeight: 52, borderRadius: 14, border: '1px solid rgba(226,232,240,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, gap: 2, background: '#f8fafc' };
const emptyCardFaceStyle: React.CSSProperties = { minHeight: 52, borderRadius: 14, border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', background: '#fafafa' };
const modalOverlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 };
const modalCardStyle: React.CSSProperties = { width: 'min(860px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 24, padding: 18, boxShadow: '0 24px 80px rgba(0,0,0,0.18)' };
const infoModalCardStyle: React.CSSProperties = { width: 'min(760px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.18)' };
const modalHeaderRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' };
const modalTitleStyle: React.CSSProperties = { fontSize: 22, fontWeight: 900, marginBottom: 4 };
const modalSubtitleStyle: React.CSSProperties = { fontSize: 13, color: '#6b7280' };
const modalContentBlockStyle: React.CSSProperties = { marginBottom: 18 };
const modalParagraphStyle: React.CSSProperties = { margin: 0, lineHeight: 1.7, color: '#374151' };
const secondaryButtonStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' };
const textareaStyle: React.CSSProperties = { display: 'block', width: '100%', minHeight: 160, marginTop: 6, padding: '10px 12px', borderRadius: 14, border: '1px solid #d9d9d9', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' };
const primaryLinkButtonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px', borderRadius: 12, background: '#111827', color: '#fff', textDecoration: 'none', fontWeight: 700 };
const pickerStageTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#4b5563', marginBottom: 8 };
const suitGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 };
const suitButtonStyle: React.CSSProperties = { minHeight: 74, borderRadius: 14, border: '1px solid #d1d5db', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' };
const rankGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))', gap: 8 };
const rankButtonStyle: React.CSSProperties = { minHeight: 64, borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 };
const rangeGroupTitleStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 8 };
