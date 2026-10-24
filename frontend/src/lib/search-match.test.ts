import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchSources, type SearchableEntry } from './search-match';

const entry: SearchableEntry = {
  name: 'Weather Oracle',
  description: 'Forecasts  for\nany city',
  authorName: 'Ada',
  authorOrganization: 'NMKR',
  apiBaseUrl: 'https://weather.example.com',
  agentIdentifier: 'abc123def',
  Capability: { name: 'text-generation', version: '1.0.0' },
  tags: ['forecast', 'climate data'],
};

describe('matchSources', () => {
  it('names the metadata field that matched', () => {
    assert.deepEqual(matchSources(entry, 'oracle'), [{ source: 'metadata', fields: ['name'] }]);
  });

  it('matches like the registry: trimmed, case-insensitive, whitespace collapsed', () => {
    assert.deepEqual(matchSources(entry, '  FOR   ANY '), [
      { source: 'metadata', fields: ['description'] },
    ]);
  });

  it('reports capability name and version as the capability source', () => {
    assert.deepEqual(matchSources(entry, 'text-gen'), [{ source: 'capability', fields: ['name'] }]);
    assert.deepEqual(matchSources(entry, '1.0.0'), [{ source: 'capability', fields: ['version'] }]);
  });

  it('reports tags, including a query that spans two tags', () => {
    assert.deepEqual(matchSources(entry, 'climate'), [
      { source: 'tags', fields: ['climate data'] },
    ]);
    // The registry joins tags with a space, so "forecast climate" matches the pair.
    assert.deepEqual(matchSources(entry, 'forecast climate'), [{ source: 'tags', fields: [] }]);
  });

  it('lists every source that matched, in a fixed order', () => {
    assert.deepEqual(matchSources(entry, 'forecast'), [
      { source: 'metadata', fields: ['description'] },
      { source: 'tags', fields: ['forecast'] },
    ]);
  });

  it('covers the asset identifier, API URL and author fields', () => {
    assert.deepEqual(matchSources(entry, '123DEF'), [
      { source: 'metadata', fields: ['assetIdentifier'] },
    ]);
    assert.deepEqual(matchSources(entry, 'weather.example'), [
      { source: 'metadata', fields: ['apiBaseUrl'] },
    ]);
    assert.deepEqual(matchSources(entry, 'nmkr'), [
      { source: 'metadata', fields: ['authorOrganization'] },
    ]);
  });

  it('falls back to "across fields" when only the joined text matches', () => {
    // "oracle forecasts" spans the end of the name and the start of the description.
    assert.deepEqual(matchSources(entry, 'oracle forecasts'), [
      { source: 'across-fields', fields: [] },
    ]);
  });

  it('returns nothing for an empty query or missing fields', () => {
    assert.deepEqual(matchSources(entry, '   '), []);
    const bare: SearchableEntry = {
      name: 'Bare',
      description: null,
      authorName: null,
      authorOrganization: null,
      apiBaseUrl: null,
      agentIdentifier: 'x',
      Capability: null,
      tags: null,
    };
    assert.deepEqual(matchSources(bare, 'bare'), [{ source: 'metadata', fields: ['name'] }]);
  });
});
