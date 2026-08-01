# Remove Pipelines Sidebar Navigation

**Date:** 2026-08-01

## Goal

Remove the Pipelines destination from the dashboard navigation panel while preserving the Pipelines feature and its routes.

## Scope

- Remove the `Pipelines` entry from the sidebar's primary navigation.
- Remove the sidebar's now-unused `GitBranch` icon import.
- Update the focused sidebar test to assert that Tasks remains visible and Pipelines is absent.

## Preserved Behavior

- `/pipelines` and its child routes remain accessible through direct links and other application entry points.
- Pipeline APIs, services, permissions, data, and documentation remain unchanged.
- The sidebar's remaining order, styling, responsive behavior, and access controls remain unchanged.

## Verification

- Run the focused sidebar navigation test.
- Run lint or TypeScript validation for the changed source and test files if supported by the project scripts.

