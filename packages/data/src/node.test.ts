import { describe, expect, it } from 'vitest';
import { loadDataset } from './load';
import { availableVersionsNode, loadDatasetNode } from './node';

describe('loadDatasetNode (czysty Node, bez import.meta.glob)', () => {
  it('zwraca ten sam zbiór co loadDataset', () => {
    expect(loadDatasetNode('2026.11')).toEqual(loadDataset('2026.11'));
  });
  it('availableVersionsNode wylicza wersje z katalogu', () => {
    expect(availableVersionsNode()).toContain('2026.11');
  });
  it('rzuca dla nieistniejącej wersji', () => {
    expect(() => loadDatasetNode('1999.01')).toThrow(/Brak zbioru danych/);
  });
});
