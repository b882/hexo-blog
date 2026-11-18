---
title: "CCPC 2024 网络预选赛 D：编码器-解码器"
date: 2026-11-18 09:27:37
description: "把字符串按「当前串 + 字符 + 当前串」倍增，用区间 DP 统计 T 作为子序列的出现次数。"
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

给定两个小写字符串 S、T，长度都不超过 100。把 S 的字符依次拼成一个大串：第一个字符单独作为初始串，之后每处理一个字符 c，就把「当前串 + c + 当前串」接成新的串。问处理完整个 S 之后，T 在这个大串中作为子序列出现了多少次，答案对 998244353 取模。

<!-- more -->

## 核心思路

设处理到第 i-1 个字符时得到的串为 P，当前字符为 c，那么新串就是 P + c + P。

用 f[l][r] 表示 T 的第 l 到第 r 个字符在 P 中作为子序列的出现次数（空区间记为 1）。新串由左右两个 P 和中间的 c 拼成，所以 T[l..r] 的匹配只有两种来源：

- 不用中间字符：枚举分界 k，T[l..k] 在左边 P 里匹配、T[k+1..r] 在右边 P 里匹配，贡献 f[l][k] × f[k+1][r]；
- 用中间字符匹配：它必须等于 T[k]，左边 P 匹配 T[l..k-1]、右边 P 匹配 T[k+1..r]，贡献 f[l][k-1] × f[k+1][r]。

按 i = 1..n 依次滚动更新，最后的 f[1][m] 就是答案（m 是 T 的长度）。时间复杂度 O(n·m³)，空间 O(m²)。

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

<!-- algopost-b7bf38a4 -->
