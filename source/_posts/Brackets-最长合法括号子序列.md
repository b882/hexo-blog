---
title: "Brackets：最长合法括号子序列"
date: 2026-10-13 23:46:37
categories:
  - 算法题解
tags:
  - "算法"
  - "C++"
  - "POJ"
  - "动态规划"
  - "区间DP"
  - "括号序列"
---

## 题意

题目来源：[POJ 2955 — Brackets](http://poj.org/problem?id=2955)。

给定一个只包含 `(`、`)`、`[`、`]` 的字符串，可以删除一些字符，但不能改变剩余字符的顺序。求能留下的最长合法括号序列的长度。输入包含多组数据，遇到 `end` 结束；每组输出一个答案。

<!-- more -->

## 做法

用区间 DP。设 `dp[i][j]` 表示从第 `i` 个字符到第 `j` 个字符中，最多能选出多少个字符组成合法括号序列。单个字符不能配对，所以长度为 1 的区间答案是 0。

计算一个区间时，考虑两种情况：

1. 如果两端是匹配的 `()` 或 `[]`，就把它们选上，得到 `dp[i+1][j-1]+2`。
2. 也可以从中间某处把区间分成左右两段，分别求答案再相加。枚举所有分割位置，取最大值。

按区间长度从小到大计算，最后输出 `dp[0][n-1]`。时间复杂度为 `O(n^3)`，空间复杂度为 `O(n^2)`。

## C++ 代码

```cpp
#include<bits/stdc++.h>
using namespace std;

int main(){
    string s;
    while(cin>>s){
        if(s=="end"){
            break;
        }
        int n=s.size();
        vector< vector<int> > dp(n,vector<int> (n,0));
        for(int len=2;len<=n;len++){
            for(int i=0;i+len-1<=n-1;i++){
                int j=i+len-1;
                if((s[i]=='('&&s[j]==')') ||(s[i]=='['&&s[j]==']')){
                    dp[i][j]=max(dp[i][j],dp[i+1][j-1]+2);
                }
                for(int k=i;k<j;k++){
                    dp[i][j]=max(dp[i][j],dp[i][k]+dp[k+1][j]);
                }
            }
        }
        cout<<dp[0][n-1]<<'\n';
    }
    
    return 0;
}
```
