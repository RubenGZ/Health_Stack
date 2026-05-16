# AIRouter — Capa de abstracción multi-provider

Centraliza todas las llamadas a modelos de lenguaje de HealthStack Pro.
Un único punto de configuración para enrutar, hacer fallback y observar.

---

## 1. Arquitectura

```
Endpoint FastAPI
      │
      ▼
  AIRouter.call(use_case, request)
      │
      ├─► [primary provider] ──► AIResponse ──► endpoint
      │         │ falla (retriable)
      │         ▼
      └─► [fallback provider] ──► AIResponse (fallback_triggered=True) ──► endpoint
                │ falla también
                ▼
          AIProviderError ──► endpoint devuelve 503 / fallback de templates
```

**Proveedores actuales:**

| Provider | Clase | Protocolo | Visión |
|---|---|---|---|
| Groq | `GroqProvider` | httpx REST (OpenAI-compat) | ✗ |
| Gemini | `GeminiProvider` | httpx REST (OpenAI-compat) | ✓ |
| Cerebras | `CerebrasProvider` | `cerebras-cloud-sdk` + `asyncio.to_thread` | ✗ |

---

## 2. Mapping use_case → provider

| AIUseCase | Primary | Primary model | Fallback | Fallback model |
|---|---|---|---|---|
| `public_chat` | gemini | gemini-2.5-flash | groq | llama-3.3-70b-versatile |
| `realtime_coach` | cerebras | llama-3.3-70b | groq | llama-3.3-70b-versatile |
| `insights_narrative` ⚠️ | gemini | gemini-2.5-pro | groq | llama-3.3-70b-versatile |
| `injury_risk` ⚠️ | gemini | gemini-2.5-pro | groq | llama-3.3-70b-versatile |
| `weekly_goals` ⚠️ | gemini | gemini-2.5-flash | groq | llama-3.3-70b-versatile |
| `food_vision` | gemini | gemini-2.5-pro | groq | llama-3.3-70b-versatile |

⚠️ = envía datos de salud. Ver [PRIVACY.md](./PRIVACY.md) y los `TODO: P0-RGPD` en `config.py`.

---

## 3. Cómo añadir un nuevo proveedor (checklist)

1. **Crear** `providers/<nombre>.py` implementando `AIProvider`:
   ```python
   class MistralProvider(AIProvider):
       @property
       def name(self) -> str: return "mistral"
       @property
       def supports_vision(self) -> bool: return False
       async def complete(self, request: AIRequest) -> AIResponse: ...
       async def health_check(self) -> bool: ...
   ```

2. **Añadir la API key** en `config.py` (`AIRouterSettings`) y en `.env.example`.

3. **Registrar** el provider en el lifespan de FastAPI (ver `main.py`):
   ```python
   providers["mistral"] = MistralProvider(settings.get_mistral_key())
   ```

4. **Actualizar** `_DEFAULT_ROUTING` en `config.py` para los use_cases deseados.

5. **Escribir tests** en `tests/services/ai_router/test_providers.py` (sin llamadas reales — usar `respx` o mocks).

---

## 4. Cambiar el mapping sin tocar código de endpoints

Edita `_DEFAULT_ROUTING` en `config.py`:

```python
AIUseCase.PUBLIC_CHAT: RoutingRule(
    primary="mistral",           # ← cambiar aquí
    primary_model="mistral-7b",  # ← y el modelo
    fallback="groq",
    fallback_model="llama-3.3-70b-versatile",
),
```

Reinicia el servidor. Los endpoints no cambian.

---

## 5. Política de timeouts y fallback

**Timeouts por use_case** (definidos en el endpoint, no en el router):

| Use case | Timeout | Justificación |
|---|---|---|
| `public_chat` | 30s | El usuario tolera esperar en chat |
| `realtime_coach` | 8s | Entre series de gym — debe ser rápido |
| `insights_*` | 10s | Carga de página — menos crítico |

**Errores que activan fallback:**
- `AITimeoutError` — el provider no respondió en el timeout
- `AIRateLimitError` — HTTP 429 del provider
- `AIProviderError` genérico — HTTP 5xx, error de red, respuesta vacía

**Errores que NO activan fallback:**
- `AIInvalidRequestError` — HTTP 4xx ≠ 429 (bug en el request, no en el provider; el fallback tendría el mismo error)

---

## 6. RGPD

Ver [PRIVACY.md](./PRIVACY.md) para la tabla completa de qué datos viajan a cada proveedor y los riesgos del free tier.

Los `TODO: P0-RGPD` en `config.py` marcan los use_cases que envían datos de salud y deben migrarse a tier de pago antes de producción real.

---

## 7. Testear sin API keys reales

Los tests usan `respx` (mock de httpx) y `unittest.mock.AsyncMock`. Cero llamadas reales.

```bash
# Solo tests del módulo ai_router
pytest tests/services/ai_router/ -v

# Con cobertura
pytest tests/services/ai_router/ --cov=app/services/ai_router --cov-report=term-missing
```

Para añadir un test de un provider nuevo:

```python
@respx.mock
async def test_mistral_success(self, user_request):
    respx.post("https://api.mistral.ai/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_openai_response("respuesta"))
    )
    provider = MistralProvider(api_key="test_key")
    resp = await provider.complete(user_request)
    assert resp.provider_used == "mistral"
```
