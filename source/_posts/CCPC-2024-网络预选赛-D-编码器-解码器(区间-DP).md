---
title: "CCPC 2024 网络预选赛 D：编码器-解码器（区间 DP）"
date: 2026-11-18 09:27:37
description: "按 S'_i = S'_{i-1} + a_i + S'_{i-1} 倍增字符串，用区间 DP 统计 T 作为子序列的出现次数。"
categories:
  - 算法题解
tags:
  - "算法"
  - "C++"
  - "区间DP"
  - "动态规划"
  - "字符串"
  - "CCPC"
  - "网络预选赛"
---

## 题意

题目来源：2024 CCPC 网络预选赛 D 题「编码器-解码器」。

给定两个小写字符串 `S`、`T`，按 `S'_1 = a_1`、`S'_i = S'_{i-1} + a_i + S'_{i-1}` 构造出 `S'_n`，求 `T` 在 `S'_n` 中作为子序列出现的次数，对 `998244353` 取模。`|S|, |T| ≤ 100`。

<!-- more -->

## 核心思路

每次把字符串写成 `S'_i = L + c + L`，其中 `L = S'_{i-1}`、`c = a_i`。设 `dp[l][r]` 表示 `T[l..r]` 在 `S'_{i-1}` 中作为子序列的出现次数，空区间 `dp[l][l-1] = 1`。

从 `S'_{i-1}` 推到 `S'_i` 时，按 `T[l..r]` 怎么匹配分类：

- **不用中间字符**：枚举分界 `k`，`T[l..k]` 匹配左边 `L`、`T[k+1..r]` 匹配右边 `L`，累加 `dp[l][k] * dp[k+1][r]`。
- **用中间字符匹配 `T[k]`**：需要 `c == T[k]`，左边匹配 `T[l..k-1]`、右边匹配 `T[k+1..r]`，累加 `dp[l][k-1] * dp[k+1][r]`。

枚举 `i = 1..n`，每轮用上一轮的 `dp` 算出新的 `f`，最后答案就是 `dp[1][m]`。复杂度 `O(n m^3)`，`m ≤ 100` 时约 `1.7×10^7` 次转移。

## 完整代码

```cpp
#include<bits/stdc++.h>
using namespace std;
#define ll long long
const ll MOD=998244353;
ll dp[110][110],f[110][110];
int main(){
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string s,t;
    cin>>s>>t;
    int n=s.size();
    int m=t.size();
    for(int i=1;i<=m+1;i++){
        dp[i][i-1]=1;
    }
    s=" "+s;
    t=" "+t;
    for(int i=1;i<=n;i++){
        memset(f,0,sizeof(f));
        for(int j=1;j<=m+1;j++){
            f[j][j-1]=1;
        }
        for(int len=1;len<=m;len++){
            for(int l=1;l+len-1<=m;l++){
                int r=l+len-1;
                for(int k=l-1;k<=r;k++){
                    f[l][r]=(f[l][r]+(dp[l][k]*dp[k+1][r])%MOD)%MOD;
                    if(k>=l&&s[i]==t[k]){
                        f[l][r]=(f[l][r]+(dp[l][k-1]*dp[k+1][r])%MOD)%MOD;
                    }
                }
            }
        }
        memcpy(dp,f,sizeof(dp));
    }
    cout<<dp[1][m]<<endl;
    return 0;
}
```

<!-- algopost-de202147 -->
