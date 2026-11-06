---
layout: post
title: Standardize the pipeline before you scale the team
description: Why templating CI/CD early pays off more than another dashboard.
date: 2026-08-06
---

The code is ready. Great. Now: which pipeline, which variables, which artifact repository—and who remembers the one setting that makes this work?

At Wolfspeed, standardizing Azure DevOps pipelines meant getting more of that setup into something repeatable. Less copy-paste wiring. Fewer details living exclusively in somebody’s head.

## What changed

We pulled the shared path into templates:

- a base pipeline for build, test, and publish
- named environments with consistent gates
- TDD expectations baked into the definition of done

The headline number was roughly **30% faster deploys**. The quieter win was
fewer "works on my agent" surprises.

## The bit I keep coming back to

The interesting part to me is how much of delivery speed lives outside the application code. Variables, artifacts, test steps, environment setup. All the little things.

I’d look at making that shared path versioned and understandable before reaching for another dashboard. Less remembering the ritual; more running the same process.

If you're writing your first pipeline standard, start smaller than a platform
team charter:

1. One language / one runtime path
2. One way to promote an artifact
3. One place to read failure logs

Then I can see what still hurts. I don’t need to build an entire platform team into the first template.
