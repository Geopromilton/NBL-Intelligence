"""NVIDIA API catalog client (OpenAI-compatible chat completions), with streaming.

Key lookup order (the key is never written into the program folder):
  1. environment variable NVIDIA_API_KEY
  2. Windows Credential Manager: service "NBL-Intelligence", else the key
     already saved by NBL-AquaTwin (service "NBL-AquaTwin-AI")
  3. %LOCALAPPDATA%\\NBL-Intelligence\\ai_key.txt, else
     %LOCALAPPDATA%\\NBL-AquaTwin\\ai_key.txt
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Iterator

import httpx

from .. import settings

SERVICE = "NBL-Intelligence"
AQUATWIN_SERVICE = "NBL-AquaTwin-AI"


def _keyring():
    try:
        import keyring  # type: ignore
        keyring.get_keyring()
        return keyring
    except Exception:
        return None


def _key_files() -> list[Path]:
    files = [settings.user_dir() / "ai_key.txt"]
    la = os.environ.get("LOCALAPPDATA")
    if la:
        files.append(Path(la) / "NBL-AquaTwin" / "ai_key.txt")
    return files


def get_key() -> tuple[str | None, str]:
    if os.environ.get("NVIDIA_API_KEY"):
        return os.environ["NVIDIA_API_KEY"].strip(), "environment variable"
    kr = _keyring()
    if kr:
        for svc, where in ((SERVICE, "Windows Credential Manager"), (AQUATWIN_SERVICE, "Windows Credential Manager (shared with NBL-AquaTwin)")):
            try:
                k = kr.get_password(svc, "api_key")
                if k:
                    return k.strip(), where
            except Exception:
                pass
    for f in _key_files():
        if f.exists():
            k = f.read_text(encoding="utf-8").strip()
            if k:
                return k, str(f)
    return None, "not set"


def set_key(key: str) -> str:
    key = key.strip()
    kr = _keyring()
    if kr:
        try:
            kr.set_password(SERVICE, "api_key", key)
            return "Windows Credential Manager"
        except Exception:
            pass
    f = settings.user_dir() / "ai_key.txt"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(key, encoding="utf-8")
    return str(f)


def delete_key() -> None:
    kr = _keyring()
    if kr:
        try:
            kr.delete_password(SERVICE, "api_key")
        except Exception:
            pass
    f = settings.user_dir() / "ai_key.txt"
    if f.exists():
        f.unlink()


def mask(k: str | None) -> str:
    return "" if not k else (k[:6] + "..." + k[-4:] if len(k) > 12 else "***")


class AIError(RuntimeError):
    pass


_THINK = re.compile(r"<think>.*?</think>", re.S)


def _request(model: str | None, messages: list[dict[str, str]], stream: bool, max_tokens: int | None = None):
    cfg = settings.load()["ai"]
    key, _ = get_key()
    if not key and "integrate.api.nvidia.com" in cfg["base_url"]:
        raise AIError("No NVIDIA API key is set. Add it in Settings.")
    url = cfg["base_url"].rstrip("/") + "/chat/completions"
    body = {"model": model or cfg["model"], "messages": messages, "temperature": cfg.get("temperature", 0.2),
            "max_tokens": max_tokens or cfg.get("max_tokens", 16000), "stream": stream}
    if "thinking" in cfg and "nemotron" in str(body["model"]):
        body["chat_template_kwargs"] = {"enable_thinking": bool(cfg.get("thinking"))}
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    return url, body, headers, float(cfg.get("timeout_s", 60))


def chat(messages: list[dict[str, str]], model: str | None = None, max_tokens: int | None = None) -> dict[str, Any]:
    url, body, headers, timeout = _request(model, messages, False, max_tokens)
    t0 = time.time()
    try:
        r = httpx.post(url, json=body, headers=headers, timeout=timeout)
    except httpx.HTTPError as e:
        raise AIError(f"Could not reach the AI service ({type(e).__name__}).") from e
    if r.status_code >= 400:
        raise AIError(f"AI service returned {r.status_code}: {r.text[:300]}")
    msg = r.json()["choices"][0]["message"]
    text = _THINK.sub("", msg.get("content") or "").strip()
    return {"text": text, "model": body["model"], "seconds": round(time.time() - t0, 1)}


class Thought(str):
    """A piece of the model's reasoning (deep think), kept apart from the answer."""


def chat_stream(messages: list[dict[str, str]], model: str | None = None) -> Iterator[str]:
    """Yield pieces of the reply as they arrive. Reasoning (reasoning_content or <think> text)
    is yielded as Thought pieces so callers can show it but keep it out of the answer."""
    url, body, headers, timeout = _request(model, messages, True)
    in_think = False
    try:
        with httpx.stream("POST", url, json=body, headers=headers, timeout=httpx.Timeout(timeout, read=timeout)) as r:
            if r.status_code >= 400:
                r.read()
                raise AIError(f"AI service returned {r.status_code}: {r.text[:300]}")
            for line in r.iter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0].get("delta") or {}
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                thought = delta.get("reasoning_content") or delta.get("reasoning") or ""
                if thought:
                    yield Thought(thought)
                piece = delta.get("content") or ""
                while piece:
                    if in_think:
                        end = piece.find("</think>")
                        if end < 0:
                            yield Thought(piece)
                            piece = ""
                        else:
                            yield Thought(piece[:end])
                            piece, in_think = piece[end + 8:], False
                    else:
                        start = piece.find("<think>")
                        if start < 0:
                            yield piece
                            piece = ""
                        else:
                            if start:
                                yield piece[:start]
                            piece, in_think = piece[start + 7:], True
    except httpx.HTTPError as e:
        raise AIError(f"Could not reach the AI service ({type(e).__name__}).") from e


def models_to_try() -> list[str]:
    cfg = settings.load()["ai"]
    return [m for m in (cfg["model"], cfg.get("fallback_model")) if m]


def chat_with_fallback(messages: list[dict[str, str]]) -> dict[str, Any]:
    errors = []
    for model in models_to_try():
        try:
            return chat(messages, model=model)
        except AIError as e:
            errors.append(f"{model}: {e}")
    raise AIError(" | ".join(errors))


def list_models() -> dict[str, Any]:
    cfg = settings.load()["ai"]
    key, _ = get_key()
    try:
        r = httpx.get(cfg["base_url"].rstrip("/") + "/models", headers={"Authorization": f"Bearer {key}"} if key else {}, timeout=20)
        r.raise_for_status()
        ids = sorted(m["id"] for m in r.json().get("data", []))
        return {"ok": True, "models": ids}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "models": []}


def test_connection() -> dict[str, Any]:
    errors = []
    for model in models_to_try():
        try:
            t0 = time.time()
            text = "".join(p for p in chat_stream([{"role": "user", "content": "Reply with the single word: ready"}], model=model) if not isinstance(p, Thought))
            return {"ok": True, "model": model, "seconds": round(time.time() - t0, 1), "reply": text.strip()[:80], "streaming": True}
        except AIError as e:
            errors.append(f"{model}: {e}")
    return {"ok": False, "error": " | ".join(errors)}
