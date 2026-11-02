---
title: "Minimum Spanning Tree：加至多 k 条距离边的最小生成树"
date: 2026-11-02 22:23:25
description: "把加边归约成相邻单位边，用带配额的 Kruskal 求最优值，并输出加边方案与树边编号。"
categories:
  - 算法题解
tags:
  - "算法"
  - "C++"
  - "图论"
  - "最小生成树"
  - "Kruskal"
  - "并查集"
  - "贪心"
  - "构造"
  - "sua"
  - "省赛"
---

## 题意

题目来源：第十五届山东省 CCPC 大学生程序设计竞赛 H 题（出题组：sua）。

给定 `n` 个点、`m` 条边的无向连通图，可以再加入至多 `k` 条边，连接 `u`、`v` 的新边权值为 `|u-v|`。求加边后最小生成树的最小总权值，并输出方案：加了哪些边、总权值，以及生成树的 `n-1` 条边编号（原边 `1..m`，新边从 `m+1` 开始）。

<!-- more -->

## 核心思路

设最优解加了 `c` 条新边，删掉它们后原边分成 `c+1` 个连通块。顶点编号本身就是一条链，把这 `c+1` 个连通块沿链接起来只需要 `c` 条 `(i, i+1)` 边，每条权值都是 `1`；而原来 `c` 条新边的权值和至少是 `c`。所以一定存在只用相邻单位边的最优解。

于是只需选一个原边森林 `F`，剩下的 `n-1-|F|` 个连通块用相邻边补齐，补边数不能超过 `k`，即 `|F| ≥ n-1-k`，总代价是 `(n-1) + Σ(w(e)-1)`。

把 `w(e)-1` 看成每条原边的代价：`w=0` 的边必收，`w=1` 的边白收，`w≥2` 的边只在边数不够 `n-1-k` 时才收。按 `w` 升序跑 Kruskal 时按这个条件筛选，最后用 `(i, i+1)` 把剩余连通块补齐即可，复杂度 `O(m log m)`。

## 完整代码

```cpp
#include<bits/stdc++.h>
using namespace std;
#define ll long long
#define ALL(x) (x).begin(),(x).end()
struct Edge{
	int u,v,id;
	ll w;
};
bool cmp(Edge a,Edge b){
	return a.w<b.w;
}
struct DSU{
	vector<int> f,sz;
	DSU(int n) : f(n),sz(n,1){
		iota(ALL(f),0);
	}
	int find(int x){
		return f[x] == x ? x : f[x]=find(f[x]);
	}
	bool merge(int a,int b){
		a=find(a);
		b=find(b);
		if(a==b) return 0;
		if(sz[a]<sz[b]) swap(a,b);
		f[b]=a;
		sz[a]+=sz[b];
		return 1;
	}
};

int main(){
	ios::sync_with_stdio(false);	
	cin.tie(nullptr);
	int t;
	cin>>t;
	while(t--){
		int n,m,k;
		cin>>n>>m>>k;
		vector<Edge> mp(m+1);
		for(int i=1;i<=m;i++){
			cin>>mp[i].u>>mp[i].v>>mp[i].w;
			mp[i].id=i;
		}
		sort(mp.begin()+1,mp.end(),cmp);
		DSU dsu(n+1);
		int num=0;
		ll ans=0;
		vector<int> ansss;
		
		for(int i=1;i<=m;i++){
			if(num==n-1){
				break;
			}
			if(num<n-1-k || mp[i].w<=1){
				if(dsu.merge(mp[i].u,mp[i].v)==1){
					num++;
					ans+=mp[i].w;
					ansss.push_back(mp[i].id);
				}
			}
		}
		vector<pair<int,int> > anss;
		int bnum=num;
//		cout<<ans<<endl;
		for(int i=1;i<n;i++){
			if(num==n-1){
				break;
			}
			if(dsu.merge(i,i+1)==1){
				num++;
				anss.push_back({i,i+1});
				ansss.push_back(num-bnum+m);
				ans+=1;
			}
		}
		cout<<anss.size()<<"\n";
		for(int i=0;i<anss.size();i++){
			cout<<anss[i].first<<' '<<anss[i].second<<"\n";
		}
		cout<<ans<<'\n';
		for(int i=0;i<ansss.size();i++){
			cout<<ansss[i]<<' ';
			
		}
		cout<<'\n';
	}
	
	
	return 0;
}
/*
3

5 6 10
1 2 3
2 3 5
1 4 7
4 2 4
5 4 8
3 5 1

4 5 100
1 2 2
2 3 0
2 4 0
4 1 1
3 4 3
3 2 0
1 2 100
2 3 100

*/
```

<!-- algopost-0b8f702f -->
