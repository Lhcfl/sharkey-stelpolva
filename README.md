<div align="center">
<a href="https://joinsharkey.org/">
	<img src="https://activitypub.software/TransFem-org/Sharkey/-/raw/develop/packages/frontend/assets/sharkey.svg" alt="Sharkey logo" style="border-radius:50%" width="300"/>
</a>

## Sharkey Stelpolva Edition

**🌎 **[Sharkey](https://joinsharkey.org/)** is an open source, decentralized social media platform that's free forever! 🚀**

---

<a href="https://docs.joinsharkey.org/docs/install/fresh/">
		<img src="https://custom-icon-badges.herokuapp.com/badge/create_an-instance-FBD53C?logoColor=FBD53C&style=for-the-badge&logo=server&labelColor=363B40" alt="create an instance"/></a>

<a href="./CONTRIBUTING.md">
		<img src="https://custom-icon-badges.herokuapp.com/badge/become_a-contributor-A371F7?logoColor=A371F7&style=for-the-badge&logo=git-merge&labelColor=363B40" alt="become a contributor"/></a>

<a href="https://discord.gg/6VgKmEqHNk">
		<img src="https://custom-icon-badges.herokuapp.com/badge/join_the-community-5865F2?logoColor=5865F2&style=for-the-badge&logo=discord&labelColor=363B40" alt="join the community"/></a>

<a href="https://opencollective.com/sharkey">
		<img src="https://custom-icon-badges.herokuapp.com/badge/donate-81ACF4?logoColor=81ACF4&style=for-the-badge&logo=opencollective&labelColor=363B40" alt="donate"/></a>

---

</div>

## 相对于 Sharkey 的修改：

> [!NOTE]
> We only provide Chinese README.md to explain our changes relative to upstream Sharkey. Fortunately, the Chinese below is accurate under Google Translate.

### DATABASE CHANGES

- 添加了 pgroonga 用于全文搜索

### Other

#### Behaviour Changes

- 还原了 Misskey 的 Hashtag 搜索设置，即你能搜到任何你可见的打了某个 Hashtag 的帖子
- 限制了非meilisearch使用搜索可以搜到的visibility，防止随意搜到他人的unlisted/home帖子
- 在 Sharkey Stelpolva 中，递归地 fetch 被回复帖子时如果出错不再一定会递归地将错误抛下，导致整个任务失败，而是会视情况静默吞下该错误
- 限制 proxyAccount 当且仅当本地用户没有关注远程用户的时候发送关注请求

#### Fixes

- 许多微小的可能影响体验的 bug/feature 修复
- 修复了 SkDetailedNote 帖子被编辑后不会更新 MFM 的问题
- 修复一些 `@click.stop` 缺失的问题

#### Improvements

- 更好的中文翻译
- 允许的界面字体范围大大增加，默认字体从14px改为16px
- 处于 collapsed 状态的被回复/被折叠帖子现在采用 stpvInline MFM，提供完整但inline的MFM体验

#### Features

- 添加了 Google Translation Fallback
- 在 MkPostForm 上添加了 autosize （自动随着打字扩张文本框）
- MkUrlPreview中添加了对 ActivityPub Note 的 Quote-style 预览支持
- 允许 MkUrlPreview 打开 Bilibili 播放器
- 更好的 Notification Read 逻辑，自动使得通知变为已读
- Firefish 风格的 InstanceTicker（点击打开实例信息页面而不是转到原帖子）
- 注册dialog上面可以写多行文本和MFM
- 允许多行 CW
- 允许切换界面字体，并添加了大量中文字体
- 在天线中添加特殊关键词
	- `domain:xxx.com` 匹配来自 `xxx.com` 的任意帖子
	- `domain:here` 匹配来自本实例的任意帖子
- 允许加载某些白名单远程服务器的 AvatarDecorations （仅限 Misskey系 ）
  - 请在 .config/default.yml 中添加一个字符串数组 `avatarDecorationAllowedHosts`
	- 它是允许加载 Misskey 的头像挂件的白名单实例
	- 启用了 MediaProxy，因此应该不用担心安全风险
- 添加功能允许自动在中文与英文之间添加空格
- 对于含有需要高亮的代码的帖子，fallback显示非高亮的代码而非MkLoading
- 在 EmojiPicker 添加 emoji 预览
- 帖子时光机：可以查看某日期的时间线和用户发帖
- 私密化：可以批量/单独私密化某些帖子
- 允许频道发布非仅本地的帖子
- 允许在前端禁用 Reactions 功能
- 允许搜索以 `.bsky.social` 结尾的 Bluesky 用户
- 允许在前端折叠（Soft mute）用户/某个帖子

#### Changes merged from upstream

- 允许用户查看她们发送但对方还没批准的关注请求

## 从 Sharkey 迁移？ 

> [!WARNING]
> Take your risk!
> We follow the develop branch of Sharkey, not the stable branch. So you may encounter features that are not so "stable".

> [!NOTE]
> Sharkey Stelpolva Edition 不提供 Docker 安装方式。如果需要 Docker 安装你可以自己编辑 Docker Compose 并添加下面的额外依赖。

Sharkey Stelpolva 和 Sharkey 是完全兼容的，并且跟随 Sharkey 的最新 develop 分支，对于已有的 Sharkey 迁移到 Sharkey Stelpolva 你只需要额外安装一些依赖即可：

- Pgroonga: 按照 https://pgroonga.github.io/install/ 的说明进行安装，随后进入到 Sharkey 的数据库执行：
```SQL
CREATE EXTENSION pgroonga;
```

## 从 Sharkey Stelpolva 迁移回 Sharkey？

不需要做任何额外处理，直接更换分支即可

<div>

<a href="https://joinsharkey.org/"><img src="https://cdn.shonk.social/files/b671c81c-58cf-4f13-bc96-af0b0c96c667.webp" align="right" height="520px"/></a>

## ✨ Features
- **ActivityPub support**\
Not on Sharkey? No problem! Not only can Sharkey instances talk to each other, but you can make friends with people on other networks like Mastodon and Pixelfed!
- **Federated Backgrounds and Music status**\
You can add a background to your profile as well as a music status via ListenBrainz, show everyone what music you are currently listening to
- **Mastodon API**\
Sharkey implements the Mastodon API unlike normal Misskey
- **UI/UX Improvements**\
Sharkey makes some UI/UX improvements to make it easier to navigate
- **Sign-Up Approval**\
With Sharkey, you can enable sign-ups, subject to manual moderator approval and mandatory user-provided reasons for joining.
- **Rich Web UI**\
       Sharkey has a rich and easy to use Web UI!
       It is highly customizable, from changing the layout and adding widgets to making custom themes.
       Furthermore, plugins can be created using AiScript, an original programming language.
- And much more...

</div>

<div style="clear: both;"></div>

## Documentation

Sharkey Documentation can be found at [Sharkey Documentation](https://docs.joinsharkey.org/docs/install/fresh/)
