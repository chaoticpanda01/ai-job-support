"""
The job-translation system prompt's privacy rule.

A posting translated from a URL is shared with every user, translation
included, and the translation is a full one -- so a scout email addressed to
the user would publish their name in Indonesian even with the raw paste
hidden. Rule 6 tells the model to leave the recipient out.

These tests pin the wording, not the model's behaviour: they fail if the rule
is deleted or rule 2 goes back to forbidding any omission, which would
contradict it. Whether the model complies can only be checked against the
real model, and that is a residual risk the rule reduces rather than removes.
"""

from app.services.ai.prompts.job_translation import build_system_prompt


def test_the_prompt_tells_the_model_to_leave_the_recipient_out() -> None:
    prompt = build_system_prompt()
    assert "6. Privacy:" in prompt
    for must_mention in ("their name", "greetings and sign-offs", "personal contact details"):
        assert must_mention in prompt
    # The rule has to say which fields it covers and why they matter.
    assert "shown to every user" in prompt


def test_the_full_translation_rule_makes_room_for_it() -> None:
    # Rule 2 used to forbid omitting anything. Left as it was, it would
    # contradict rule 6 and leave the model to pick one.
    prompt = build_system_prompt()
    assert "rule 6 is the only exception" in prompt
    assert "Do not summarise or omit any section." not in prompt
