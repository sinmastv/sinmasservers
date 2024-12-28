using System.Collections.Generic;

namespace Oxide.Plugins
{
    [Info("No Flykick", "August", "1.3.4")]
    [Description("Allows players with permission to bypass flyhack kicks.")]
    class NoFlykick : RustPlugin
    {
        #region Fields/Initialization
        private const string permUse = "noflykick.use";
        private const string permManage = "noflykick.manage";
        private bool IsEnabled;

        private void Init()
        {
            IsEnabled = true;

            permission.RegisterPermission(permUse, this);
            permission.RegisterPermission(permManage, this);
        }
        #endregion

        #region Localization
        protected override void LoadDefaultMessages()
        {
            // English
            lang.RegisterMessages(new Dictionary<string, string> {
                ["NoPerm"] = "Error: No Permission",
                ["Syntax"] = "Error: Syntax",
                ["Unknown Argument"] = " Error: Unknown Argument",

                ["Enabled"] = "Flyhack kick overrides are currently enabled for admins.",
                ["Disabled"] = "Flyhack kick overrides are currently disabled for admins.",

                ["NowEnabled"] = "Flyhack kick overrides are now enabled for admins",
                ["NowDisabled"] = "Flyhack kick overrides are now disabled for admins",

                ["Help Text"] = "Commands: \n" +
                                "/nokick stat/status - Prints whether or not flyhack kick override is enabled. \n" +
                                "/nokick toggle - Toggles flyhack kick override on or off."
        }, this);
        }
        #endregion

        #region Functions
        private void GetStatus(BasePlayer player)
        {
            if (IsEnabled)
            {
                player.ChatMessage(Lang("Enabled", player.UserIDString));
            }
            else
            {
                player.ChatMessage(Lang("Disabled", player.UserIDString));
            }
        }
        private void Toggle(BasePlayer player)
        {
            if (IsEnabled)
            {
                Unsubscribe(nameof(OnPlayerViolation));
                player.ChatMessage(Lang("NowDisabled", player.UserIDString));
            }
            else
            {
                Subscribe(nameof(OnPlayerViolation));
                player.ChatMessage(Lang("NowEnabled", player.UserIDString));
            }
            IsEnabled = !IsEnabled;
        }
        
        private string Lang(string key, string id = null, params object[] args) => string.Format(lang.GetMessage(key, this, id), args);
        #endregion

        #region Commands
        [ChatCommand("nokick")]
        private void NoKickChatCommand(BasePlayer player, string cmd, string[] args)
        {
            if (!permission.UserHasPermission(player.UserIDString, permManage))
            {
                player.ChatMessage(Lang("NoPerm", player.UserIDString));
                return;
            }
            if (args.Length != 1)
            {
                player.ChatMessage(Lang("Syntax", player.UserIDString));
                return;
            }

            switch (args[0].ToLower())
            {
                case "stat":
                case "status":
                    GetStatus(player);                 
                    break;

                case "toggle":
                    Toggle(player);            
                    break;

                case "help":
                    player.ChatMessage(Lang("Help Text", player.UserIDString));
                    break;

                default:
                    player.ChatMessage(Lang("Unknown Argument", player.UserIDString));
                    break;
            }
        }
        #endregion

        #region Hooks
        object OnPlayerViolation(BasePlayer player, AntiHackType type, float amount)
        {
            if (type == AntiHackType.FlyHack)
            {
                if (permission.UserHasPermission(player.UserIDString, permUse))
                {
                    return true;
                }
            }
        return null;
        }
        #endregion
    }
}