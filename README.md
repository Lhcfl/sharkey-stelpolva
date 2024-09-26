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

- 添加了 Google Translation Fallback
- 更好的中文翻译
- 在 MkPostForm 上添加了 autosize （自动随着打字扩张文本框）
- 还原了 Misskey 的 Hashtag 搜索设置，即你能搜到任何你可见的打了某个 Hashtag 的帖子
- MkUrlPreview中添加了对 ActivityPub Note 的 Quote-style 预览支持
- 允许 MkUrlPreview 打开 Bilibili 播放器
- 更好的 Notification Read 逻辑，自动使得通知变为已读
- Firefish 风格的 InstanceTicker（点击打开实例信息页面而不是转到原帖子）
- 注册dialog上面可以写多行文本和MFM
- 修复了SkDetailedNote帖子被编辑后不会更新MFM的问题
- 允许多行 CW
- 许多微小的可能影响体验的bug/feature修复
- 允许切换界面字体，并添加了大量中文字体
- 在天线中添加特殊关键词
	- `domain:xxx.com` 匹配来自 `xxx.com` 的任意帖子
	- `domain:here` 匹配来自本实例的任意帖子
- 允许加载某些白名单远程服务器的 AvatarDecorations （仅限 Misskey系 ）
  - 请在 .config/default.yml 中添加一个字符串数组 `avatarDecorationAllowedHosts`
	- 它是允许加载 Misskey 的头像挂件的白名单实例
	- 启用了 MediaProxy，因此应该不用担心安全风险

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
