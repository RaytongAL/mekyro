import json
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.modules.agent.registry import openai_tools


SYSTEM_PROMPT = """You are the Mekyro supplier operations assistant.

Your job is to answer business questions naturally and accurately using the available tools.

Rules:
1. Always answer in the user's language. For Chinese users, use clear, natural Simplified Chinese.
2. Use tools whenever the question depends on workspace data. Never invent records, totals, fields, or tool results.
   For country filters, always pass an ISO 3166-1 alpha-2 code such as JP, CN, or US.
3. When a tool is needed, call it directly without filler such as "I can query that" or "Let me check".
4. After receiving tool results, give a complete answer instead of merely repeating raw values:
   - lead with the direct conclusion and emphasize important numbers;
   - explain what the result means when useful;
   - use a compact Markdown table when listing multiple records;
   - mention filters and scope so the user knows what was counted;
   - end with one relevant next-step suggestion when it adds value.
5. Preserve conversational context. Resolve short follow-up questions from earlier messages and tool results.
6. For write operations, collect missing required fields, summarize the pending change, and use the proper tool. Never claim a write succeeded before the tool confirms it.
7. Do not expose hidden reasoning or chain-of-thought. The UI already shows a neutral thinking indicator.
8. Avoid generic capability statements unless the user explicitly asks what you can do.
9. Keep answers focused: usually 2-5 short paragraphs or a small table, with no unnecessary headings or decorative emoji.
"""


STAGE_LABELS = {
    "new": "新线索",
    "contacted": "已联系",
    "qualified": "已确认意向",
    "converted": "已转化",
    "lost": "已流失",
}

COUNTRY_LABELS = {
    "CN": "中国",
    "JP": "日本",
    "KR": "韩国",
    "US": "美国",
    "DE": "德国",
    "FR": "法国",
    "GB": "英国",
    "CA": "加拿大",
}

COUNTRY_ALIASES = {
    "中国": "CN",
    "日本": "JP",
    "韩国": "KR",
    "美国": "US",
    "德国": "DE",
    "法国": "FR",
    "英国": "GB",
    "加拿大": "CA",
    "china": "CN",
    "japan": "JP",
    "korea": "KR",
    "usa": "US",
    "germany": "DE",
    "france": "FR",
    "uk": "GB",
    "canada": "CA",
}


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict = field(default_factory=dict)
    execution_key: str | None = None


@dataclass(frozen=True)
class AgentPlan:
    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()


class ModelGateway(Protocol):
    async def plan(self, *, message: str, history: list[dict]) -> AgentPlan: ...

    async def optimize_lead_requirement(self, requirement: str) -> str: ...


class ModelGatewayError(RuntimeError):
    pass


class OpenAICompatibleModelGateway:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_seconds: float = 30,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.client = client

    async def plan(self, *, message: str, history: list[dict]) -> AgentPlan:
        messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            }
        ]
        for item in history:
            role = item.get("role")
            content = str(item.get("content") or "").strip()
            if role == "assistant" and item.get("tool_calls"):
                messages.append(
                    {
                        "role": "assistant",
                        "content": content or None,
                        "tool_calls": item["tool_calls"],
                    }
                )
            elif role == "tool" and item.get("tool_call_id") and content:
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": item["tool_call_id"],
                        "content": content,
                    }
                )
            elif role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        if message and messages[-1] != {"role": "user", "content": message}:
            messages.append({"role": "user", "content": message})
        payload = {
            "model": self.model,
            "messages": messages,
            "tools": openai_tools(),
            "tool_choice": "auto",
            "stream": False,
            "temperature": 0.2,
            "max_tokens": 1200,
        }
        try:
            if self.client is None:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json=payload,
                    )
            else:
                response = await self.client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
            response.raise_for_status()
            body = response.json()
            response_message = body["choices"][0]["message"]
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise ModelGatewayError("Agent model request failed") from exc

        tool_calls = []
        for item in response_message.get("tool_calls") or []:
            function = item.get("function") or {}
            name = str(function.get("name") or "")
            if not name:
                continue
            raw_arguments = function.get("arguments") or "{}"
            try:
                arguments = json.loads(raw_arguments) if isinstance(raw_arguments, str) else raw_arguments
            except json.JSONDecodeError as exc:
                raise ModelGatewayError("Agent model returned invalid tool arguments") from exc
            if not isinstance(arguments, dict):
                raise ModelGatewayError("Agent model returned non-object tool arguments")
            tool_calls.append(ToolCall(name=name, arguments=arguments, execution_key=item.get("id")))
        return AgentPlan(
            text=str(response_message.get("content") or ""),
            tool_calls=tuple(tool_calls),
        )

    async def optimize_lead_requirement(self, requirement: str) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是 Mekyro 的获客需求文字润色助手，只能改写用户已经提供的内容，不能扩写需求。"
                        "必须把口语化、含糊或聊天式表达改写为清晰、专业、可执行的业务需求，"
                        "例如去掉‘想要一些’‘那种’‘把商品卖给他们’等口语结构，改为‘寻找’‘目标市场’‘销售现有商品’等明确表达。"
                        "地区、行业、客户类型、产品名称和渠道名称必须原样保留，不得替换、泛化或添加同义对象。"
                        "如果用户已经列出具体国家，又附带‘那种欧美国家’‘之类的地区’等错误或含糊归类，"
                        "必须保留每个具体国家并删除错误归类，不得在国家列表后添加‘等欧美国家’。"
                        "例如‘想要一些印度、芬兰那种欧美国家的买家，把内部的商品卖给他们’应改写为"
                        "‘寻找印度、芬兰的买家，向其销售现有商品。’"
                        "严禁新增采购能力、合作意向、采购频率、采购数量、联系方式或其他筛选条件，"
                        "也不得使用‘包括但不限于’补充示例。"
                        "只输出一条通顺、简洁的简体中文句子，不要标题、列表、解释或引号，最多 150 字。"
                    ),
                },
                {"role": "user", "content": requirement},
            ],
            "stream": False,
            "temperature": 0.2,
            "max_tokens": 200,
        }
        try:
            if self.client is None:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json=payload,
                    )
            else:
                response = await self.client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
            response.raise_for_status()
            optimized = str(response.json()["choices"][0]["message"]["content"] or "").strip()
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise ModelGatewayError("Lead requirement optimization failed") from exc
        return optimized or requirement


class DeterministicModelGateway:
    """Offline fallback used by development, tests, and provider outages."""

    async def optimize_lead_requirement(self, requirement: str) -> str:
        raise ModelGatewayError("Lead requirement optimization requires a configured model")

    async def plan(self, *, message: str, history: list[dict]) -> AgentPlan:
        normalized = " ".join(message.strip().split())
        if not normalized:
            for item in reversed(history):
                if item.get("role") != "tool" or not item.get("content"):
                    continue
                try:
                    result = json.loads(str(item["content"]))
                except (TypeError, ValueError, json.JSONDecodeError):
                    continue
                tool_name, tool_arguments = self._tool_context(
                    history, str(item.get("tool_call_id") or "")
                )
                if isinstance(result, dict) and isinstance(result.get("stats"), list):
                    stats = result["stats"]
                    total = int(result.get("total", 0))
                    valid_stats = [row for row in stats if isinstance(row, dict)]
                    if len(valid_stats) == 1 and valid_stats[0].get("stage") == "new":
                        return AgentPlan(text=(
                            f"当前共有 **{total} 条线索**，全部处于 **新线索（new）** 阶段，"
                            "说明这些线索尚未开始联系。\n\n"
                            "建议下一步先按国家、推荐评分或创建时间筛选一批优先跟进的线索。"
                        ))
                    lines = [f"当前共有 **{total} 条线索**，各阶段分布如下：", ""]
                    for row in valid_stats:
                        stage = str(row.get("stage") or "unknown")
                        count = int(row.get("count") or 0)
                        ratio = (count / total * 100) if total else 0
                        label = STAGE_LABELS.get(stage, stage)
                        lines.append(f"- **{label}（{stage}）**：{count} 条，占 {ratio:.1f}%")
                    lines.extend(["", "可以继续告诉我国家或阶段，我会帮你缩小范围并列出具体线索。"])
                    return AgentPlan(text="\n".join(lines))
                if isinstance(result, dict) and isinstance(result.get("results"), list):
                    rows = result["results"]
                    if tool_name == "lead_list_leads":
                        return AgentPlan(text=self._lead_summary(result, rows, tool_arguments))
                    if rows and all(isinstance(row, dict) and row.get("name") for row in rows):
                        names = [str(row["name"]) for row in rows]
                        return AgentPlan(
                            text=f"当前工作区共有 {result.get('total', len(names))} 个商品："
                            + "、".join(names)
                            + "。"
                        )
                    if rows and all(isinstance(row, dict) and row.get("merchant_name") for row in rows):
                        names = [str(row["merchant_name"]) for row in rows]
                        return AgentPlan(
                            text=f"当前工作区共有 {result.get('total', len(names))} 条线索："
                            + "、".join(names)
                            + "。"
                        )
                    return AgentPlan(text=f"已查询到 {result.get('total', len(rows))} 条当前工作区记录。")
                if isinstance(result, dict):
                    return AgentPlan(text=json.dumps(result, ensure_ascii=False))
            return AgentPlan()
        lowered = normalized.lower()
        if lowered.startswith("/tool "):
            name, _, raw_arguments = normalized[6:].partition(" ")
            try:
                arguments = json.loads(raw_arguments) if raw_arguments else {}
            except json.JSONDecodeError:
                return AgentPlan(text="工具参数不是有效的 JSON 对象。")
            if not isinstance(arguments, dict):
                return AgentPlan(text="工具参数必须是 JSON 对象。")
            return AgentPlan(tool_calls=(ToolCall(name=name, arguments=arguments),))
        matched_country = next(
            (country for alias, country in COUNTRY_ALIASES.items() if alias in lowered),
            "",
        )
        has_lead_context = (
            "线索" in normalized
            or "lead" in lowered
            or self._history_mentions_leads(history)
        )
        if matched_country and has_lead_context:
            return AgentPlan(
                tool_calls=(
                    ToolCall(name="lead_list_leads", arguments={"country": matched_country}),
                )
            )
        if (
            any(term in lowered for term in ("线索阶段", "各阶段", "阶段分布", "lead stage", "count leads"))
            or ("线索" in normalized and any(term in normalized for term in ("多少", "几条", "数量", "总数")))
        ):
            return AgentPlan(tool_calls=(ToolCall(name="lead_count_by_stage"),))
        if "线索" in normalized and any(
            term in normalized for term in ("新增", "新建", "创建", "添加", "录入")
        ):
            return AgentPlan(
                text=(
                    "可以新增线索。请提供公司名称、商户名称、两位国家代码（例如 CN、US），"
                    "以及至少一种联系方式（Email、电话或 WhatsApp）；也可以补充联系人、城市和描述。"
                    "信息齐全后我会生成待确认内容，不会直接写入。"
                )
            )
        if "线索" in normalized and any(
            term in normalized for term in ("获得", "获取", "寻找", "开发", "怎么找", "怎么办", "如何")
        ):
            return AgentPlan(
                text=(
                    "获取目标线索时，先明确目标国家、客户类型（批发商、零售商或维修商）、"
                    "主力产品和采购规模，再在线索模块创建或导入名单并按这些条件筛选。"
                    "你可以告诉我目标国家、客户类型和预计采购量，我会继续帮你整理筛选条件；"
                    "当前系统不会自动从外部采集新线索。"
                )
            )
        if "线索" in normalized or "lead" in lowered:
            arguments: dict[str, str | int] = {}
            if matched_country:
                arguments["country"] = matched_country
            if any(term in normalized for term in ("最新", "最近一条", "最近的", "latest lead")):
                arguments["page_size"] = 1
            return AgentPlan(tool_calls=(ToolCall(name="lead_list_leads", arguments=arguments),))
        if any(term in lowered for term in ("查看库存", "库存", "sku 列表", "list skus", "stock")):
            return AgentPlan(tool_calls=(ToolCall(name="product_list_skus"),))
        if any(
            term in lowered
            for term in (
                "查看商品",
                "商品列表",
                "有哪些商品",
                "我们的商品",
                "list products",
                "what products",
                "which products",
                "our products",
                "products do we have",
            )
        ):
            return AgentPlan(tool_calls=(ToolCall(name="product_list_products"),))
        if any(term in lowered for term in ("查看配置", "workspace config", "supplier profile")):
            return AgentPlan(tool_calls=(ToolCall(name="config_get_profile"),))
        if any(
            term in normalized
            for term in ("业务写操作", "写操作", "怎么执行", "如何执行", "怎么触发", "如何触发")
        ):
            return AgentPlan(
                text=(
                    "直接告诉我“对象 + 动作 + 具体内容”即可，例如："
                    "“把线索 ABC 的阶段改为已联系”“创建商品 iPhone 15，价格 5000 元”"
                    "或“SKU IP15-BLK 库存增加 10”。涉及新增、修改、删除或库存调整时，"
                    "我会先展示待执行内容；你明确确认后才会写入。你现在想操作线索、商品还是库存？"
                )
            )
        if any(
            term in normalized
            for term in ("怎么使用", "如何使用", "怎么用", "你能做什么", "可以做什么", "使用方法")
        ):
            return AgentPlan(
                text=(
                    "你可以直接用自然语言提问或下达任务。例如："
                    "“有多少条线索”“日本市场有哪些线索”“有哪些商品”“查看库存”。"
                    "需要修改数据时，请说明对象、动作和具体内容，我会先让你确认再执行。"
                )
            )
        return AgentPlan(
            text=(
                "我还不能确定你要处理什么。请补充对象和动作，例如查询线索、查看商品、"
                "检查库存，或说明要新增、修改的具体内容。"
            )
        )

    @staticmethod
    def _tool_context(history: list[dict], tool_call_id: str) -> tuple[str, dict]:
        for item in reversed(history):
            for call in item.get("tool_calls") or []:
                if str(call.get("id") or "") != tool_call_id:
                    continue
                function = call.get("function") or {}
                raw_arguments = function.get("arguments") or "{}"
                try:
                    arguments = (
                        json.loads(raw_arguments)
                        if isinstance(raw_arguments, str)
                        else raw_arguments
                    )
                except (TypeError, ValueError, json.JSONDecodeError):
                    arguments = {}
                return str(function.get("name") or ""), arguments if isinstance(arguments, dict) else {}
        return "", {}

    @staticmethod
    def _history_mentions_leads(history: list[dict]) -> bool:
        for item in history[-8:]:
            content = str(item.get("content") or "").lower()
            if item.get("role") == "user" and ("线索" in content or "lead" in content):
                return True
            for call in item.get("tool_calls") or []:
                function = call.get("function") or {}
                if str(function.get("name") or "").startswith("lead_"):
                    return True
        return False

    @staticmethod
    def _lead_summary(result: dict, rows: list, arguments: dict) -> str:
        total = int(result.get("total", len(rows)))
        country_code = str(arguments.get("country") or "").upper()
        country = COUNTRY_LABELS.get(country_code, country_code)
        scope = f"地区为{country}的" if country else "当前工作区的"
        if total == 0:
            return f"目前没有查询到{scope}线索。你可以换一个国家或取消筛选后再查。"

        lines = [f"目前{scope}线索共有 **{total} 条**。"]
        visible_rows = [row for row in rows if isinstance(row, dict)][:10]
        if visible_rows:
            lines.extend([
                "",
                "| 商家名称 | 企业名称 | 阶段 | 推荐评分 |",
                "| --- | --- | --- | ---: |",
            ])
            for row in visible_rows:
                merchant = str(row.get("merchant_name") or "-").replace("|", "\\|")
                company = str(row.get("company_name") or "-").replace("|", "\\|")
                stage = str(row.get("stage") or "-")
                stage_text = f"{STAGE_LABELS.get(stage, stage)}（{stage}）" if stage != "-" else "-"
                score = row.get("recommendation_score")
                score_text = "-" if score is None else str(score)
                lines.append(f"| {merchant} | {company} | {stage_text} | {score_text} |")
        if total > len(visible_rows):
            lines.extend(["", f"以上展示前 {len(visible_rows)} 条，共 {total} 条。"])
        lines.extend(["", "需要的话，我可以继续按阶段、推荐评分或最近联系时间帮你筛选。"])
        return "\n".join(lines)
