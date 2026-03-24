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

type PickerTarget =
  | { area: 'hero'; index: 0 | 1 }
  | { area: 'board'; index: 0 | 1 | 2 | 3 | 4 };

const presetOptions = ['any-two', 'loose', 'standard', 'tight', 'premium', 'pocket-pairs', 'broadway', 'suited-aces', 'suited-connectors', 'suited-one-gappers', 'big-cards', 'suited-hands', 'value-heavy', 'speculative'] as const;
const validRanks = new Set(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);
const validSuits = new Set(['s', 'h', 'd', 'c']);
const rankOrder = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const suitOrder = ['s', 'h', 'd', 'c'] as const;

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
  if (action === 'raise') return { bg: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', fg: '#166534', pill: '#166534' };
  if (action === 'call') return { bg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', fg: '#1d4ed8', pill: '#1d4ed8' };
  if (action === 'check') return { bg: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)', fg: '#374151', pill: '#374151' };
  return { bg: 'linear-gradient(135deg, #fee2e2, #fecaca)', fg: '#991b1b', pill: '#991b1b' };
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

  if (normalizedHero.length !== 2) {
    messages.push('Hero Hand 必须正好 2 张牌。');
  }

  if (![0, 3, 4, 5].includes(normalizedBoard.length)) {
    messages.push('Board 只能是 0 / 3 / 4 / 5 张牌。');
  }

  if (invalidCards.length > 0) {
    messages.push(`存在非法牌面编码：${Array.from(new Set(invalidCards)).join(', ')}`);
  }

  if (duplicateCards.length > 0) {
    messages.push(`存在重复牌：${Array.from(new Set(duplicateCards)).join(', ')}`);
  }

  return {
    isValid: messages.length === 0,
    messages,
    normalizedHero,
    normalizedBoard,
  };
}

function getSummaryLine(result: AnalyzeResponse): string {
  if (result.hand.madeHand === 'high-card' && result.hand.draws.length === 0) {
    return '当前还没成手，而且没有明显听牌，偏向谨慎处理。';
  }
  if (result.hand.draws.includes('combo-draw')) {
    return '虽然未必已经很强，但组合听牌让后续改良空间明显变大。';
  }
  if (result.hand.madeHand !== 'high-card') {
    return `当前已经形成${getMadeHandLabel(result.hand.madeHand)}，不是纯空气牌。`;
  }
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

function ResultCard({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ ...resultCardStyle, borderTop: accent ? `3px solid ${accent}` : '3px solid transparent' }}>
      <h3 style={resultCardTitleStyle}>{title}</h3>
      {children}
    </div>
  );
}

export default function HomePage() {
  const [heroHandInput, setHeroHandInput] = useState(exampleScenarios.default.heroHandInput);
  const [boardInput, setBoardInput] = useState(exampleScenarios.default.boardInput);
  const [rangePreset, setRangePreset] = useState<(typeof presetOptions)[number]>(exampleScenarios.default.rangePreset);
  const [rangeText, setRangeText] = useState(exampleScenarios.default.rangeText);
  const [rangePresets, setRangePresets] = useState<RangePresetMeta[]>([]);
  const [showAdvancedRange, setShowAdvancedRange] = useState(false);
  const [iterations, setIterations] = useState(exampleScenarios.default.iterations);
  const [playerCount, setPlayerCount] = useState(exampleScenarios.default.playerCount);
  const [rngSeed, setRngSeed] = useState(exampleScenarios.default.rngSeed);
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:8787');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerSuit, setPickerSuit] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackSubject, setFeedbackSubject] = useState('Poker Trainer 反馈');
  const [feedbackMessage, setFeedbackMessage] = useState('我想反馈的问题/建议：');

  const heroPreview = useMemo(() => parseCardList(heroHandInput), [heroHandInput]);
  const boardPreview = useMemo(() => parseCardList(boardInput), [boardInput]);
  const validation = useMemo(() => getValidationState(heroPreview, boardPreview), [heroPreview, boardPreview]);
  const resultTone = result ? getEquityTone(result.equity.equity) : null;
  const actionTheme = result ? getActionTheme(result.recommendation.action) : null;
  const usedCards = useMemo(
    () => [...validation.normalizedHero, ...validation.normalizedBoard].filter(isValidCardCode),
    [validation.normalizedHero, validation.normalizedBoard],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRangePresets() {
      try {
        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/ranges/presets`);
        const data = await response.json();
        if (!response.ok) return;
        if (!cancelled && Array.isArray(data.presets)) {
          setRangePresets(data.presets);
        }
      } catch {
        // ignore preset metadata fetch failures in UI layer
      }
    }

    loadRangePresets();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const currentRangePreset = useMemo(
    () => rangePresets.find((preset) => preset.name === rangePreset) ?? null,
    [rangePresets, rangePreset],
  );

  const quickRangePresets = useMemo(
    () => rangePresets.filter((preset) => ['any-two', 'standard', 'tight', 'premium', 'broadway', 'pocket-pairs', 'suited-aces', 'suited-connectors'].includes(preset.name)),
    [rangePresets],
  );

  const groupedRangePresets = useMemo(() => {
    const groups = {
      宽度类: [] as RangePresetMeta[],
      牌型认知类: [] as RangePresetMeta[],
      风格导向类: [] as RangePresetMeta[],
    };

    for (const preset of rangePresets) {
      groups[preset.category].push(preset);
    }

    return groups;
  }, [rangePresets]);

  function applyScenario(key: keyof typeof exampleScenarios) {
    const scenario = exampleScenarios[key];
    setHeroHandInput(scenario.heroHandInput);
    setBoardInput(scenario.boardInput);
    setRangePreset(scenario.rangePreset);
    setRangeText(scenario.rangeText);
    setIterations(scenario.iterations);
    setPlayerCount(scenario.playerCount);
    setRngSeed(scenario.rngSeed);
    setResult(null);
    setError(null);
    setPickerTarget(null);
    setPickerSuit(null);
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
        rangeText: rangeText.trim() || undefined,
        iterations: Number(iterations),
        rngSeed: Number(rngSeed),
        playerCount: Number(playerCount),
      };

      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Analyze request failed');
      }

      setResult(data as AnalyzeResponse);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'Inter, Arial, sans-serif', maxWidth: 1160, margin: '0 auto' }}>
      <div style={heroHeaderStyle}>
        <div style={heroHeaderTopBarStyle}>
          <button type="button" style={heroTopButtonStyle} onClick={() => setShowHelpModal(true)}>说明</button>
          <button type="button" style={heroTopButtonStyle} onClick={() => setShowFeedbackModal(true)}>反馈</button>
        </div>
        <div>
          <div style={eyebrowStyle}>Single-opponent training MVP</div>
          <h1 style={{ marginBottom: 8, marginTop: 0 }}>Poker Trainer</h1>
          <p style={{ color: '#dbe4ff', marginTop: 0, lineHeight: 1.7, maxWidth: 760 }}>
            输入手牌、公牌和对手范围后，页面会给出 <strong>胜率、当前牌力、听牌结构与教学型建议</strong>。
            当前版本聚焦 <strong>单对手分析</strong>，先把训练体验做顺手、做稳。
          </p>
        </div>
      </div>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <strong>快速示例：</strong>
          {Object.entries(exampleScenarios).map(([key, item]) => (
            <button key={key} onClick={() => applyScenario(key as keyof typeof exampleScenarios)} style={chipButtonStyle}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 18, marginBottom: 18 }}>
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>输入参数</h2>

          <div style={inputTopLayoutStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>点牌器</div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <div style={pickerLabelStyle}>Hero Hand</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <CardSlot value={heroPreview[0] ?? ''} label="H1" onClick={() => { setPickerTarget({ area: 'hero', index: 0 }); setPickerSuit(null); }} />
                      <CardSlot value={heroPreview[1] ?? ''} label="H2" onClick={() => { setPickerTarget({ area: 'hero', index: 1 }); setPickerSuit(null); }} />
                    </div>
                  </div>

                  <div>
                    <div style={pickerLabelStyle}>Board</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {([0, 1, 2, 3, 4] as const).map((index) => (
                        <CardSlot
                          key={index}
                          value={boardPreview[index] ?? ''}
                          label={`B${index + 1}`}
                          onClick={() => { setPickerTarget({ area: 'board', index }); setPickerSuit(null); }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={inputFieldsGridStyle}>
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

                <div style={labelStyle}>
                  <div style={{ marginBottom: 8 }}>快速范围</div>
                  <div style={quickPresetWrapStyle}>
                    {quickRangePresets.length > 0
                      ? quickRangePresets.map((preset) => {
                          const active = !rangeText.trim() && rangePreset === preset.name;
                          return (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => {
                                setRangePreset(preset.name as (typeof presetOptions)[number]);
                                setRangeText('');
                              }}
                              style={{
                                ...quickPresetChipStyle,
                                background: active ? '#111827' : '#fff',
                                color: active ? '#fff' : '#111827',
                                borderColor: active ? '#111827' : '#d1d5db',
                              }}
                            >
                              {preset.label}
                            </button>
                          );
                        })
                      : presetOptions.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setRangePreset(preset);
                              setRangeText('');
                            }}
                            style={{ ...quickPresetChipStyle, background: rangePreset === preset ? '#111827' : '#fff', color: rangePreset === preset ? '#fff' : '#111827', borderColor: rangePreset === preset ? '#111827' : '#d1d5db' }}
                          >
                            {preset}
                          </button>
                        ))}
                  </div>
                </div>

                <div style={rangeBrowsePanelStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>更多范围（按分类）</div>

                  {rangePresets.length > 0 ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {Object.entries(groupedRangePresets).map(([groupName, presets]) => (
                        <div key={groupName}>
                          <div style={rangeGroupTitleStyle}>{groupName}</div>
                          <div style={quickPresetWrapStyle}>
                            {presets.map((preset) => {
                              const active = !rangeText.trim() && rangePreset === preset.name;
                              return (
                                <button
                                  key={preset.name}
                                  type="button"
                                  onClick={() => {
                                    setRangePreset(preset.name as (typeof presetOptions)[number]);
                                    setRangeText('');
                                  }}
                                  style={{
                                    ...quickPresetChipStyle,
                                    background: active ? '#111827' : '#fff',
                                    color: active ? '#fff' : '#111827',
                                    borderColor: active ? '#111827' : '#d1d5db',
                                  }}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <select style={inputStyle} value={rangePreset} onChange={(e) => { setRangePreset(e.target.value as (typeof presetOptions)[number]); setRangeText(''); }}>
                      {presetOptions.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div style={advancedRangePanelStyle}>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedRange((value) => !value)}
                    style={advancedRangeToggleStyle}
                  >
                    <span>高级范围输入</span>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>{showAdvancedRange ? '收起' : '展开'}</span>
                  </button>

                  {showAdvancedRange ? (
                    <div style={advancedRangeBodyStyle}>
                      <label style={labelStyle}>
                        Range Text（高级，可选；填写后优先于 preset）
                        <input style={inputStyle} value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="TT+,AJs+,KQo" />
                      </label>
                      <div style={advancedRangeHintStyle}>
                        适合熟悉德州扑克范围简写的用户。示例：<code>TT+</code>、<code>AJs+</code>、<code>KQo</code>、<code>76s-54s</code>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <small style={hintStyle}>Hero / Board 也可以直接手输，点牌器和文本输入会同步。</small>
              <small style={hintStyle}>Range Text 支持：AA / AKs / AKo / TT+ / AJs+ / 76s-54s / 逗号组合</small>
              <small style={hintStyle}>Board 支持 0 / 3 / 4 / 5 张公共牌；player count 当前仅记录，实际仍按单对手（2 人）计算。</small>
            </div>

            <aside style={actionRailStyle}>
              <div style={actionRailCardStyle}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>运行参数</div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label style={labelStyle}>
                    Iterations
                    <input style={inputStyle} value={iterations} onChange={(e) => setIterations(e.target.value)} />
                  </label>

                  <label style={labelStyle}>
                    RNG Seed
                    <input style={inputStyle} value={rngSeed} onChange={(e) => setRngSeed(e.target.value)} />
                  </label>

                  <label style={labelStyle}>
                    Player Count
                    <input style={inputStyle} value={playerCount} onChange={(e) => setPlayerCount(e.target.value)} />
                  </label>
                </div>

                {!validation.isValid ? (
                  <div style={{ ...noticeStyle, background: '#fff7e6', borderColor: '#ffd591', color: '#ad4e00' }}>
                    <strong>输入还没准备好：</strong>
                    <ul style={listStyle}>
                      {validation.messages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ ...noticeStyle, background: '#f6ffed', borderColor: '#b7eb8f', color: '#237804' }}>
                    输入格式看起来没问题，可以直接分析。
                  </div>
                )}

                <button onClick={handleAnalyze} disabled={loading || !validation.isValid} style={buttonStyle}>
                  {loading ? '分析中…' : '开始分析'}
                </button>

                {error ? <div style={{ ...noticeStyle, background: '#fff1f0', borderColor: '#ffccc7', color: '#a8071a' }}>{error}</div> : null}
              </div>
            </aside>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ ...heroResultCardStyle, background: actionTheme?.bg ?? 'linear-gradient(135deg, #f8fafc, #eef2ff)', color: actionTheme?.fg ?? '#111827' }}>
            <div style={heroResultTopRowStyle}>
              <div>
                <div style={{ fontSize: 13, opacity: 0.82, marginBottom: 6 }}>结论先看</div>
                <div style={{ fontSize: 30, fontWeight: 900, marginBottom: 8 }}>{result ? actionLabel(result.recommendation.action) : '等待分析'}</div>
                <div style={{ fontSize: 15, lineHeight: 1.7, maxWidth: 720 }}>
                  {result
                    ? `${result.explanation.headline} 当前 equity ${pct(result.equity.equity)}，整体属于 ${resultTone?.label}。`
                    : '先选择一手牌，再点击开始分析。这里会优先给出一句最重要的训练结论。'}
                </div>
              </div>
              {result ? <div style={{ ...actionPillStyle, background: actionTheme?.pill }}>{actionLabel(result.recommendation.action)}</div> : null}
            </div>

            <div style={metricGridStyle}>
              <div style={metricCardStrongStyle}>
                <div style={metricLabelLightStyle}>Equity</div>
                <div style={metricValueStrongStyle}>{result ? pct(result.equity.equity) : '—'}</div>
              </div>
              <div style={metricCardStrongStyle}>
                <div style={metricLabelLightStyle}>Made Hand</div>
                <div style={metricValueStrongStyle}>{result ? getMadeHandLabel(result.hand.madeHand) : '—'}</div>
              </div>
              <div style={metricCardStrongStyle}>
                <div style={metricLabelLightStyle}>Confidence</div>
                <div style={metricValueStrongStyle}>{result ? pct(result.recommendation.confidence) : '—'}</div>
              </div>
              <div style={metricCardStrongStyle}>
                <div style={metricLabelLightStyle}>Samples</div>
                <div style={metricValueStrongStyle}>{result ? result.equity.sampleCount.toLocaleString() : '—'}</div>
              </div>
            </div>
          </div>

          <div style={detailsGridStyle}>
            <ResultCard title="胜率拆解" accent="#1d4ed8">
              {result ? (
                <>
                  <div style={barGroupStyle}>
                    <div style={barHeaderStyle}><span>Win</span><strong>{pct(result.equity.winRate)}</strong></div>
                    <div style={barTrackStyle}><div style={{ ...barFillStyle, width: pct(result.equity.winRate), background: '#22c55e' }} /></div>
                  </div>
                  <div style={barGroupStyle}>
                    <div style={barHeaderStyle}><span>Tie</span><strong>{pct(result.equity.tieRate)}</strong></div>
                    <div style={barTrackStyle}><div style={{ ...barFillStyle, width: pct(result.equity.tieRate), background: '#94a3b8' }} /></div>
                  </div>
                  <div style={barGroupStyle}>
                    <div style={barHeaderStyle}><span>Lose</span><strong>{pct(result.equity.loseRate)}</strong></div>
                    <div style={barTrackStyle}><div style={{ ...barFillStyle, width: pct(result.equity.loseRate), background: '#ef4444' }} /></div>
                  </div>
                </>
              ) : (
                <div style={emptyTextStyle}>分析后这里会显示 win / tie / lose 的可视化拆解。</div>
              )}
            </ResultCard>

            <ResultCard title="牌力与听牌" accent="#7c3aed">
              {result ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <div style={miniLabelStyle}>当前牌型</div>
                    <div style={madeHandBadgeStyle}>{getMadeHandLabel(result.hand.madeHand)}</div>
                  </div>
                  <div>
                    <div style={miniLabelStyle}>听牌标签</div>
                    <div style={tagWrapStyle}>
                      {result.hand.draws.length > 0 ? (
                        result.hand.draws.map((draw) => (
                          <span key={draw} style={{ ...drawTagStyle, ...getDrawTagStyle(draw) }}>
                            {getDrawLabel(draw)}
                          </span>
                        ))
                      ) : (
                        <span style={{ ...drawTagStyle, background: '#f3f4f6', color: '#6b7280' }}>无明显听牌</span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div style={emptyTextStyle}>分析后这里会显示 made hand 和听牌标签。</div>
              )}
            </ResultCard>

            <ResultCard title="教练解释" accent="#ea580c">
              {result ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <div style={miniLabelStyle}>建议原因</div>
                    <ul style={reasonListStyle}>
                      {result.recommendation.reasons.map((reason) => (
                        <li key={reason} style={reasonItemStyle}>{reason}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div style={miniLabelStyle}>当前优势</div>
                    <div style={insightWrapStyle}>
                      {result.explanation.strengths.map((item) => (
                        <div key={item} style={{ ...insightCardStyle, background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                          <strong style={{ display: 'block', marginBottom: 4 }}>优势</strong>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={miniLabelStyle}>当前风险</div>
                    <div style={insightWrapStyle}>
                      {result.explanation.risks.map((item) => (
                        <div key={item} style={{ ...insightCardStyle, background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }}>
                          <strong style={{ display: 'block', marginBottom: 4 }}>风险</strong>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={miniLabelStyle}>训练重点</div>
                    <div style={insightWrapStyle}>
                      {result.explanation.focus.map((item) => (
                        <div key={item} style={{ ...insightCardStyle, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
                          <strong style={{ display: 'block', marginBottom: 4 }}>重点</strong>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={emptyTextStyle}>分析后这里会显示更像教练口吻的解释，以及当前优势、风险和训练重点。</div>
              )}
            </ResultCard>

            <ResultCard title="最终牌型分布" accent="#0f766e">
              {result ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={miniLabelStyle}>基于当前 Hero 手牌和公共牌，模拟最终成牌分布</div>
                  {getDistributionEntries(result.futureHandDistribution.distribution).map(([category, value]) => (
                    <div key={category} style={barGroupStyle}>
                      <div style={barHeaderStyle}><span>{getMadeHandLabel(category)}</span><strong>{pct(value)}</strong></div>
                      <div style={barTrackStyle}><div style={{ ...barFillStyle, width: pct(value), background: '#0f766e' }} /></div>
                    </div>
                  ))}
                  <div style={emptyTextStyle}>采样数：{result.futureHandDistribution.sampleCount.toLocaleString()}（Monte Carlo 估算）</div>
                </div>
              ) : (
                <div style={emptyTextStyle}>分析后这里会显示从当前街道出发，最终最可能形成哪些牌型。</div>
              )}
            </ResultCard>

            <ResultCard title="当前分析假设" accent="#475569">
              {result ? (
                <div style={assumptionGridStyle}>
                  <div style={assumptionItemStyle}><span>mode</span><strong>{result.assumptions.mode}</strong></div>
                  <div style={assumptionItemStyle}><span>rangeSource</span><strong>{result.assumptions.rangeSource}</strong></div>
                  <div style={assumptionItemStyle}><span>received</span><strong>{result.assumptions.playerCountReceived}</strong></div>
                  <div style={assumptionItemStyle}><span>applied</span><strong>{result.assumptions.playerCountApplied}</strong></div>
                </div>
              ) : (
                <div style={emptyTextStyle}>分析后这里会提醒你当前用的是单对手假设。</div>
              )}
            </ResultCard>
          </div>
        </div>
      </section>


      {showHelpModal ? (
        <div style={modalOverlayStyle} onClick={() => setShowHelpModal(false)}>
          <div style={infoModalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderRowStyle}>
              <div>
                <div style={modalTitleStyle}>说明</div>
                <div style={modalSubtitleStyle}>这个服务是什么、适合怎么用</div>
              </div>
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowHelpModal(false)}>关闭</button>
            </div>

            <div style={modalContentBlockStyle}>
              <h3 style={modalSectionTitleStyle}>背景</h3>
              <p style={modalParagraphStyle}>
                这是一个面向 <strong>单对手德州扑克训练</strong> 的分析工具，用来帮助你快速理解一手牌在某个牌面和对手范围下的大致胜率、当前牌力、听牌结构，以及一个教学型建议。
              </p>
            </div>

            <div style={modalContentBlockStyle}>
              <h3 style={modalSectionTitleStyle}>当前定位</h3>
              <ul style={modalListStyle}>
                <li>聚焦 <strong>单对手</strong> 场景</li>
                <li>适合做复盘、训练和牌感校准</li>
                <li>建议是 <strong>教学型 heuristic</strong>，不是 GTO / solver 结论</li>
                <li>胜率来自 Monte Carlo 估算，不是穷举精确解</li>
              </ul>
            </div>

            <div style={modalContentBlockStyle}>
              <h3 style={modalSectionTitleStyle}>使用方法</h3>
              <ol style={modalListStyle}>
                <li>先用左侧点牌器选择 Hero 手牌和公共牌</li>
                <li>选择一个 Range Preset，或填写自定义 Range Text</li>
                <li>点击“开始分析”</li>
                <li>优先看右侧“分析结论”，再看下面的详细结果卡片</li>
              </ol>
            </div>

            <div style={modalContentBlockStyle}>
              <h3 style={modalSectionTitleStyle}>怎么看结果</h3>
              <ul style={modalListStyle}>
                <li><strong>Equity</strong>：在当前假设下，你大致能分到多少权益</li>
                <li><strong>Made Hand</strong>：当前是否已经成手</li>
                <li><strong>听牌标签</strong>：说明后续改良空间</li>
                <li><strong>建议原因</strong>：解释当前为什么更偏向 raise / call / check / fold</li>
              </ul>
            </div>
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

            <label style={labelStyle}>
              收件人
              <input style={inputStyle} value="cq.fanlingzhi@gmail.com" readOnly />
            </label>

            <label style={labelStyle}>
              主题
              <input style={inputStyle} value={feedbackSubject} onChange={(e) => setFeedbackSubject(e.target.value)} />
            </label>

            <label style={labelStyle}>
              内容
              <textarea style={textareaStyle} value={feedbackMessage} onChange={(e) => setFeedbackMessage(e.target.value)} />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowFeedbackModal(false)}>取消</button>
              <a
                href={`mailto:cq.fanlingzhi@gmail.com?subject=${encodeURIComponent(feedbackSubject)}&body=${encodeURIComponent(feedbackMessage)}`}
                style={primaryLinkButtonStyle}
              >
                打开邮件客户端发送
              </a>
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
                <button type="button" style={secondaryButtonStyle} onClick={() => clearSlot(pickerTarget)}>
                  清空这个位置
                </button>
                <button type="button" style={secondaryButtonStyle} onClick={() => { setPickerTarget(null); setPickerSuit(null); }}>
                  关闭
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={pickerStageTitleStyle}>第一步：先选花色</div>
                <div style={suitGridStyle}>
                  {suitOrder.map((suit) => (
                    <button
                      key={suit}
                      type="button"
                      onClick={() => setPickerSuit(suit)}
                      style={{
                        ...suitButtonStyle,
                        color: getSuitColor(suit),
                        borderColor: pickerSuit === suit ? '#2563eb' : '#d1d5db',
                        background: pickerSuit === suit ? '#eff6ff' : '#fff',
                      }}
                    >
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
                      <button
                        key={rank}
                        type="button"
                        disabled={disabled}
                        onClick={() => pickerSuit && applyCardToTarget(candidate)}
                        style={{
                          ...rankButtonStyle,
                          background: isUsedElsewhere ? '#e5e7eb' : isCurrent ? '#eff6ff' : pickerSuit ? '#fff' : '#f9fafb',
                          color: pickerSuit ? getSuitColor(pickerSuit) : '#9ca3af',
                          borderColor: isCurrent ? '#2563eb' : '#d1d5db',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
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

const heroHeaderStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
  color: '#fff',
  borderRadius: 18,
  padding: '24px 26px',
  marginBottom: 18,
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.16)',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '4px 8px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.12)',
  marginBottom: 12,
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 10px 30px rgba(15,23,42,0.05)',
};

const inputTopLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 280px',
  gap: 18,
  alignItems: 'start',
};

const inputFieldsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
  gap: 12,
};

const actionRailStyle: React.CSSProperties = {
  position: 'relative',
};

const actionRailCardStyle: React.CSSProperties = {
  position: 'sticky',
  top: 18,
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 14,
  display: 'grid',
  gap: 12,
};

const heroResultCardStyle: React.CSSProperties = {
  borderRadius: 18,
  padding: 20,
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
};

const heroResultTopRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  marginBottom: 18,
  flexWrap: 'wrap',
};

const actionPillStyle: React.CSSProperties = {
  color: '#fff',
  padding: '8px 14px',
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: 20,
};

const resultCardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 16,
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
};

const resultCardTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 16,
};

const detailsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16,
};

const subTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 8,
  fontSize: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #d9d9d9',
  fontSize: 14,
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 12,
  padding: '12px 16px',
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(135deg, #111827, #1f2937)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 10px 20px rgba(17, 24, 39, 0.18)',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  cursor: 'pointer',
};

const chipButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid #d1d5db',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  boxShadow: '0 2px 6px rgba(15,23,42,0.05)',
};

const hintStyle: React.CSSProperties = {
  display: 'block',
  color: '#666',
  marginTop: -6,
  marginBottom: 12,
};

const noticeStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: '1px solid',
};

const listStyle: React.CSSProperties = {
  paddingLeft: 18,
  marginTop: 8,
  marginBottom: 0,
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
};

const metricCardStrongStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(255,255,255,0.45)',
  borderRadius: 14,
  padding: 14,
  backdropFilter: 'blur(4px)',
};

const metricLabelLightStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  marginBottom: 6,
};

const metricValueStrongStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
};

const barGroupStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  marginBottom: 10,
};

const barHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 13,
  color: '#374151',
};

const barTrackStyle: React.CSSProperties = {
  height: 10,
  background: '#e5e7eb',
  borderRadius: 999,
  overflow: 'hidden',
};

const barFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 999,
};

const madeHandBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#111827',
  color: '#fff',
  borderRadius: 999,
  padding: '8px 12px',
  fontWeight: 800,
  fontSize: 13,
};

const tagWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const drawTagStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '7px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const miniLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginBottom: 8,
};

const reasonListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gap: 10,
};

const reasonItemStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  background: '#fff7ed',
  border: '1px solid #fed7aa',
  color: '#9a3412',
  lineHeight: 1.6,
};

const assumptionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
};

const assumptionItemStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  display: 'grid',
  gap: 4,
  fontSize: 13,
  color: '#475569',
};

const emptyTextStyle: React.CSSProperties = {
  color: '#6b7280',
  lineHeight: 1.7,
  fontSize: 14,
};

const pickerLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#4b5563',
  marginBottom: 6,
  fontWeight: 700,
};

const cardSlotStyle: React.CSSProperties = {
  width: 72,
  borderRadius: 12,
  border: '1px solid #d1d5db',
  background: '#fff',
  padding: 8,
  cursor: 'pointer',
};

const cardSlotLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  marginBottom: 6,
};

const cardFaceStyle: React.CSSProperties = {
  minHeight: 52,
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 22,
  fontWeight: 800,
  gap: 2,
  background: '#f9fafb',
};

const emptyCardFaceStyle: React.CSSProperties = {
  minHeight: 52,
  borderRadius: 10,
  border: '1px dashed #d1d5db',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  color: '#9ca3af',
  background: '#fafafa',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 50,
};

const modalCardStyle: React.CSSProperties = {
  width: 'min(860px, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
};

const pickerStageTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#4b5563',
  marginBottom: 8,
};

const suitGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 10,
};

const suitButtonStyle: React.CSSProperties = {
  minHeight: 74,
  borderRadius: 12,
  border: '1px solid #d1d5db',
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  cursor: 'pointer',
};

const rankGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))',
  gap: 8,
};

const rankButtonStyle: React.CSSProperties = {
  minHeight: 64,
  borderRadius: 10,
  border: '1px solid #d1d5db',
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
};

const heroHeaderTopBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 18,
};

const heroTopButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.22)',
  background: 'rgba(255,255,255,0.10)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
};

const infoModalCardStyle: React.CSSProperties = {
  width: 'min(760px, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
};

const modalHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  marginBottom: 18,
  flexWrap: 'wrap',
};

const modalTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  marginBottom: 4,
};

const modalSubtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
};

const modalContentBlockStyle: React.CSSProperties = {
  marginBottom: 18,
};

const modalSectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  margin: '0 0 8px 0',
};

const modalParagraphStyle: React.CSSProperties = {
  margin: 0,
  lineHeight: 1.7,
  color: '#374151',
};

const modalListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  lineHeight: 1.8,
  color: '#374151',
};

const textareaStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 160,
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #d9d9d9',
  fontSize: 14,
  boxSizing: 'border-box',
  resize: 'vertical',
  fontFamily: 'inherit',
};

const primaryLinkButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 14px',
  borderRadius: 10,
  background: '#111827',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
};

const summaryPanelStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(255,255,255,0.45)',
  fontSize: 14,
  lineHeight: 1.7,
};

const insightWrapStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
};

const insightCardStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid',
  lineHeight: 1.65,
  fontSize: 14,
};

const rangeInfoCardStyle: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 12,
  padding: '14px 14px',
  borderRadius: 14,
  border: '1px solid #e5e7eb',
  background: '#fbfdff',
};

const rangeInfoTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  marginBottom: 4,
};

const rangeInfoSubtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
};

const rangeBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const rangeDescriptionStyle: React.CSSProperties = {
  lineHeight: 1.7,
  color: '#374151',
  fontSize: 14,
};

const rangeHintStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#1d4ed8',
  lineHeight: 1.65,
  fontSize: 14,
};

const quickPresetWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const quickPresetChipStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid #d1d5db',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
};

const advancedRangePanelStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: '#fcfcfd',
  overflow: 'hidden',
};

const advancedRangeToggleStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 14px',
  border: 'none',
  background: 'transparent',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  textAlign: 'left',
};

const advancedRangeBodyStyle: React.CSSProperties = {
  padding: '0 14px 14px 14px',
  borderTop: '1px solid #eef2f7',
};

const advancedRangeHintStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#475569',
  lineHeight: 1.65,
  fontSize: 13,
};

const rangeBrowsePanelStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: '#ffffff',
  padding: '14px',
};

const rangeGroupTitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  fontWeight: 800,
  marginBottom: 8,
};
