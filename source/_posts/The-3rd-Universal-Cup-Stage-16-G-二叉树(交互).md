---
title: "The 3rd Universal Cup Stage 16 G：二叉树（交互）"
date: 2026-11-02 23:53:45
description: "每次用重心把候选连通块减半，最多 log n 次询问找出特殊节点。"
categories:
  - 算法题解
tags:
  - "算法"
  - "C++"
  - "交互题"
  - "树"
  - "重心"
  - "二分"
  - "Universal Cup"
---

## 题意

题目来源：The 3rd Universal Cup, Stage 16: Nanjing, Problem G（2024 年 11 月 9—10 日）。

给定一棵 `n` 个点的二叉树，其中有一个未知的特殊节点 `s`。每次可以询问两个不同节点 `u`、`v`，裁判告诉你 `d(u,s)` 与 `d(v,s)` 的大小关系（`0/1/2`）。最多询问 `floor(log2 n)` 次，求出 `s`。裁判是适应性的，只要答案与之前的回答不冲突即可。

<!-- more -->

## 核心思路

二叉树删掉一个点后最多剩下 3 个连通块。每轮取当前连通块的重心 `c`，把删掉 `c` 后最大的两个连通块记为 `u`、`v`，询问 `(u, v)`：

- 回答 `0`：`s` 在 `u` 这一块，删掉 `c`，递归到 `u`；
- 回答 `2`：`s` 在 `v` 这一块，删掉 `c`，递归到 `v`；
- 回答 `1`：`s` 不在 `u`、`v` 里，删掉 `u`、`v`，递归到 `c`。

重心保证留下的连通块大小不超过原来的一半，所以询问次数不超过 `floor(log2 n)`；连通块只剩一个点时它就是答案。复杂度：时间 `O(n log n)`，询问 `O(log n)` 次，空间 `O(n)`。

## 完整代码

```cpp
#include <bits/stdc++.h>
using namespace std;

struct TreeCentroid {
    int n;
    vector<vector<int>> g;
    vector<int> sz, cents;
    vector<bool> del;
    TreeCentroid(int n) : n(n), g(n + 1), sz(n + 1, 0), del(n + 1, 0){}

    void add(int u, int v) {
        g[u].push_back(v);
        g[v].push_back(u);
    }
    int dfsSz(int u, int p) {
        sz[u] = 1;
        for (int v: g[u]) {
            if (v != p && !del[v]) {
                sz[u] += dfsSz(v, u);
            }
        }
        return sz[u];
    }
    void dfsc(int u, int p, int tot) {
        int mx = tot - sz[u];
        for (int v: g[u]) {
            if (v != p && !del[v]) {
                mx = max(mx, sz[v]);
            }
        }
        if (mx * 2 <= tot) {
            cents.push_back(u);
        }
        for (int v: g[u]) {
            if (v != p && !del[v]) {
                dfsc(v, u, tot);
            }
        }
    }
    vector<int> find(int root, int p) {
        cents.clear();
        dfsSz(root, p);
        dfsc(root, p, sz[root]);
        return cents;
    }
};

bool cmp(pair<int, int> a, pair<int, int> b) { return a.first > b.first; }

int main() {
    int T;
    cin >> T;
    while (T--) {
        int n;
        cin >> n;
        TreeCentroid t(n);
        for (int i = 1; i <= n; i++) {
            int x, y;
            cin >> x >> y;
            if (x)
                t.add(x, i);
            if (y)
                t.add(y, i);
        }
        int root = 1;
        while (1) {
            int c = t.find(root, 0)[0];
            int m = t.sz[root];
            if (m == 1)
                break;
            vector<pair<int, int>> comp;
            for (int v: t.g[c]) {
                if (!t.del[v]) {
                    comp.push_back({t.dfsSz(v, c), v});
                }
            }
            sort(comp.begin(), comp.end(), cmp);
            int k = comp.size();
            if (k == 1) {
                int u = comp[0].second;
                cout << "? " << u << ' ' << c << endl;
                int r;
                cin >> r;
                if (r == 0) {
                    t.del[c] = 1;
                    root = u;
                } else {
                    t.del[u] = 1;
                    root = c;
                }
            } else {
                int u = comp[0].second, v = comp[1].second;
                cout << "? " << u << ' ' << v << endl;
                int r;
                cin >> r;
                if (r == 0) {
                    t.del[c] = 1;
                    root = u;
                } else if (r == 2) {
                    t.del[c] = 1;
                    root = v;
                } else {
                    t.del[u] = 1;
                    t.del[v] = 1;
                    root = c;
                }
            }
        }
        cout << "! " << root << endl;
    }


    return 0;
}
```

<!-- algopost-151ecc70 -->
