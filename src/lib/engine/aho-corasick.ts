// VeriBrand AI — Tier-1 Deterministic Filter
// Algorithm: Aho-Corasick Automaton for Multi-Pattern Keyword & Term Matching (<50ms)
// Matches blacklisted terms, trademark casings, deprecated vocabulary, and non-brand hex codes in a single pass.

export interface PatternMatch<T = unknown> {
  pattern: string;
  start: number;
  end: number;
  data: T;
}

interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  fail: TrieNode<T> | null;
  outputs: Array<{ pattern: string; data: T }>;
}

export class AhoCorasick<T = unknown> {
  private root: TrieNode<T>;

  constructor() {
    this.root = this.createNode();
  }

  private createNode(): TrieNode<T> {
    return {
      children: new Map(),
      fail: null,
      outputs: [],
    };
  }

  public addPattern(pattern: string, data: T): void {
    if (!pattern) return;
    let current = this.root;
    const lower = pattern.toLowerCase();

    for (let i = 0; i < lower.length; i++) {
      const char = lower[i];
      if (!current.children.has(char)) {
        current.children.set(char, this.createNode());
      }
      current = current.children.get(char)!;
    }

    current.outputs.push({ pattern, data });
  }

  public buildFailureLinks(): void {
    const queue: TrieNode<T>[] = [];

    // Root children fail to root
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    // BFS through trie
    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const [char, child] of current.children.entries()) {
        let failureCandidate = current.fail;

        while (failureCandidate !== null && !failureCandidate.children.has(char)) {
          failureCandidate = failureCandidate.fail;
        }

        child.fail = failureCandidate ? failureCandidate.children.get(char)! : this.root;

        // Propagate outputs from failure node
        if (child.fail.outputs.length > 0) {
          child.outputs = [...child.outputs, ...child.fail.outputs];
        }

        queue.push(child);
      }
    }
  }

  public search(text: string): PatternMatch<T>[] {
    const results: PatternMatch<T>[] = [];
    let current = this.root;
    const lowerText = text.toLowerCase();

    for (let i = 0; i < lowerText.length; i++) {
      const char = lowerText[i];

      while (current !== this.root && !current.children.has(char)) {
        current = current.fail || this.root;
      }

      if (current.children.has(char)) {
        current = current.children.get(char)!;
      } else {
        current = this.root;
      }

      for (const out of current.outputs) {
        const start = i - out.pattern.length + 1;
        const end = i + 1;

        // Ensure word-boundary sanity for keyword patterns (avoid substring false positives like 'the' in 'theme')
        const prevChar = start > 0 ? lowerText[start - 1] : ' ';
        const nextChar = end < lowerText.length ? lowerText[end] : ' ';
        const isWordBoundary =
          !/[a-z0-9]/i.test(prevChar) && !/[a-z0-9]/i.test(nextChar);

        // Allow hex codes and special symbols to match directly
        const isSpecialPattern = out.pattern.startsWith('#') || out.pattern.includes('-');

        if (isWordBoundary || isSpecialPattern) {
          results.push({
            pattern: out.pattern,
            start,
            end,
            data: out.data,
          });
        }
      }
    }

    return results;
  }
}
