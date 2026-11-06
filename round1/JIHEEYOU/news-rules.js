// Local topic rules: suggestions are project experiments, not verified article capabilities.
globalThis.NewsRules = (() => {
  const day = value => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const isToday = (timestamp, now = Date.now()) => Number.isFinite(timestamp) && timestamp <= now && day(timestamp) === day(now);
  function classify(title, description = "") {
    if (/사기|주가|급락|급등|매출|선거|공산주의|이적설|발행 중단|해고|인수합병|취약점 발견|전송함/.test(title)) return null;
    const text = `${title} ${description}`;
    const technical = /\b(?:LLM|RAG|MCP|SDK|API|Rust|TypeScript|JavaScript|React|Vue|Docker|Kubernetes|SQL|WebAssembly|WebGPU|WebCodecs|CSS|DOM|Servo|Copilot)\b|오픈소스|개발 도구|코딩 에이전트|브라우저 엔진|언어 모델/i;
    const development = /출시|공개|업데이트|지원|도구|구현|이식|작동|측정|벤치마크|실험|모델|오픈소스|release|launch/i;
    if (!technical.test(text) || !development.test(text)) return null;
    if (/\bRAG\b|임베딩|벡터 검색/i.test(text)) return "search";
    if (/\bMCP\b/i.test(text)) return "mcp";
    if (/WebCodecs|원격 데스크톱/i.test(text)) return "remote";
    if (/\b(?:Servo|CSS|DOM|React|Vue|WebGPU|WebAssembly)\b|브라우저 엔진/i.test(text)) return "web";
    if (/\bRust\b|이식/i.test(title)) return "performance";
    if (/\bLLM\b|언어 모델|코딩 에이전트|Copilot/i.test(text)) return "ai";
    return "tool";
  }
  const plans = {
    search: { label: "저장한 기사 검색 실험", steps: ["저장한 기사 10개와 찾고 싶은 질문 5개를 준비하세요.", "현재 제목 검색과 기사에서 소개하는 검색 방식을 별도 실험으로 비교하세요.", "정답 기사 적중률·응답 시간·설치 비용을 기록하고, 개선이 확인될 때 검색 탭에 도입하세요."], note: "로컬 모델 또는 별도 서버가 필요할 수 있습니다. 팝업 안에서 직접 실행된다고 가정하지 마세요." },
    mcp: { label: "할 일·스크랩 도구 연동 설계", steps: ["할 일 조회와 기사 목록 조회를 읽기 전용 도구로 먼저 정의하세요.", "원문의 연결 방식을 확인하고, 확장프로그램과 별도 서버 사이에 예제 데이터만 전달하는 실험을 만드세요.", "쓰기 기능은 사용자 확인 후 실행하도록 설계하고, 기존 할 일이 바뀌지 않는지 확인하세요."], note: "별도 연결 프로그램과 인증 설계가 필요한 확장 과제입니다." },
    remote: { label: "확장프로그램 원격 시연 검토", steps: ["기사의 지원 운영체제와 서버 구동 조건을 먼저 확인하세요.", "예제 데이터가 든 별도 브라우저에서 팝업을 시연하는 실험을 준비하세요.", "영상 녹화보다 시연이 편한지 비교하고, 필요할 때만 원격 시연에 사용하세요."], note: "할 일 기능 자체와의 관련성은 낮습니다. 지금 앱에 직접 넣기보다는 시연용으로 검토하세요." },
    web: { label: "할 일 완료율 UI 실험", steps: ["기사에서 소개하는 웹 기능 중 이 앱에 필요한 항목 한 가지만 고르세요.", "Chrome에서 지원되는지 확인한 뒤, 예제 할 일로 완료율 표시 또는 카드 UI를 별도 화면에 구현하세요.", "키보드 조작과 기존 화면의 가독성을 비교하고, 미지원 시 기존 UI로 돌아가도록 하세요."], note: "다른 브라우저 엔진의 새 기능이 Chrome에서도 지원된다는 뜻은 아닙니다." },
    performance: { label: "뉴스 처리 성능 측정", steps: ["현재 뉴스 파싱·필터·렌더링 시간을 각각 측정하세요.", "예제 기사 100개로 느려지는 부분을 찾고, 기사에서 소개한 개선 접근을 작은 실험에 적용하세요.", "시간·복잡도를 비교하세요. 현재 5개 처리에 문제가 없다면 언어 교체는 보류하세요."], note: "기사의 대규모 시스템 성과가 작은 확장프로그램에서도 재현된다고 보장할 수 없습니다." },
    ai: { label: "기사 요약 품질 실험", steps: ["원문에서 모델·도구의 사용 조건과 비용을 확인하세요.", "기사 5개의 제공 소개를 예제 입력으로 삼아 한 줄 요약을 별도 환경에서 시험하세요.", "원문에 없는 주장·지연·비용을 확인하세요. 도입한다면 요약과 원문을 함께 표시하고 비밀 키는 확장프로그램에 넣지 마세요."], note: "현재 앱이 AI 요약을 수행하는 것은 아닙니다. 별도 모델 연결이 필요한 실험 제안입니다." },
    tool: { label: "새 도구 적용 가능성 검토", steps: ["원문에서 지원 환경·라이선스·사용 예제를 확인하세요.", "현재 뉴스 수집·저장·표시 중 개선할 부분 하나를 정하고 예제 데이터로 비교하세요.", "설치 부담에 비해 개선 효과가 있는지 기록한 뒤 도입 여부를 결정하세요."], note: "기사 전체를 자동 분석한 결과가 아니라 분야별 제안입니다." },
  };
  const categories = {
    search: { label: "검색 · RAG", why: "문맥 기반 검색은 필요한 정보를 찾는 흐름을 개선할 여지가 있습니다.", environment: "검색 기능을 만드는 개발자 · JavaScript 프론트엔드와 검색 서버" },
    mcp: { label: "AI 도구 연동", why: "데이터와 도구의 연결 방식을 표준화하면 반복 작업을 줄이는 데 도움이 될 수 있습니다.", environment: "AI 도구 개발자 · 서버 연동 담당자" },
    remote: { label: "개발 도구", why: "원격 시연 도구는 설치 없이 결과를 공유하는 방법을 제공할 수 있습니다.", environment: "개발·QA·기술 시연 담당자 · 지원 운영체제 확인 필요" },
    web: { label: "웹 플랫폼", why: "웹 플랫폼의 변화를 알아두면 UI 구현과 접근성 개선에 활용할 수 있습니다.", environment: "프론트엔드 개발자 · Chrome 확장 · HTML/CSS/JavaScript" },
    performance: { label: "성능 · 아키텍처", why: "성능 개선 사례는 실제 병목을 측정하고 변경 범위를 정하는 참고 자료가 됩니다.", environment: "프론트엔드·런타임 개발자 · 프로파일링 환경" },
    ai: { label: "AI · LLM", why: "모델·개발 도구의 변화를 비교하면 업무 자동화의 품질과 비용을 판단하는 데 도움이 됩니다.", environment: "AI 기능 개발자 · 업무 자동화 담당자 · 별도 모델 환경" },
    tool: { label: "기술 도구", why: "새 도구는 반복 작업을 줄일 후보가 될 수 있지만 도입 비용과 효과를 함께 비교해야 합니다.", environment: "개발자·IT 운영 담당자 · 도구별 지원 환경 확인 필요" },
  };
  const tagRules = [
    ["React", /\bReact\b/i], ["TypeScript", /\bTypeScript\b/i], ["JavaScript", /\bJavaScript\b/i],
    ["RAG", /\bRAG\b/i], ["LLM", /\bLLM\b|언어 모델/i], ["MCP", /\bMCP\b/i],
    ["Rust", /\bRust\b/i], ["CSS", /\bCSS\b/i], ["Servo", /\bServo\b/i],
    ["WebGPU", /\bWebGPU\b/i], ["WebAssembly", /\bWebAssembly\b/i], ["WebCodecs", /\bWebCodecs\b/i],
    ["Docker", /\bDocker\b/i], ["Kubernetes", /\bKubernetes\b/i], ["AI Agent", /AI agent|코딩 에이전트|AI 에이전트/i],
    ["API", /\bAPI\b/i], ["Copilot", /\bCopilot\b/i], ["SQL", /\bSQL\b/i],
  ];
  const tags = article => tagRules.filter(([, rule]) => rule.test(article.title || "")).map(([name]) => name);
  function plan(article) {
    const category = classify(article.title, article.description);
    if (!category) return null;
    const source = plans[category];
    // Only template copy changes; article text and existing stored tasks remain intact.
    const label = source.label.replace(/실험/g, "개선 검토");
    const articleTags = tags(article);
    return { ...source, ...categories[category], id: category + "-v1", category,
      categoryLabel: categories[category].label, label,
      purpose: `${articleTags[0] || categories[category].label} 관련 접근을 참고해 ${label}에 적용할 수 있는지 검토합니다.`,
      steps: source.steps.map(step => step.replace(/별도 실험/g, "별도 예제").replace(/작은 실험/g, "작은 예제").replace(/실험을/g, "검토용 예제를")),
      note: source.note.replace(/실험 제안/g, "활용 아이디어").replace(/실험/g, "예제"),
    };
  }
  return { day, isToday, classify, plan, tags, categories };
})();
