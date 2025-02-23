/*
This file is part of Extraplanetary Launchpads.

Extraplanetary Launchpads is free software: you can redistribute it and/or
modify it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Extraplanetary Launchpads is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Extraplanetary Launchpads.  If not, see
<http://www.gnu.org/licenses/>.
*/
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

using KSP.IO;
using ModuleWheels;

namespace ExtraplanetaryLaunchpads {

	public class ELSurveyStation : PartModule, IModuleInfo, IPartMassModifier, ELBuildControl.IBuilder, ELControlInterface, ELWorkSink/*, ELRenameDialog.IRenamable*/
	{
		[KSPField (isPersistant = true, guiActive = true, guiName = "Pad name")]
		public string StationName = "";
		string oldName = "";

		[KSPField (isPersistant = true)]
		public bool Operational = true;

		[KSPField] public float EVARange = 0;

		EL_VirtualPad virtualPad;
		internal List<SurveySite> available_sites { get; private set; }
		internal SurveySite site { get; private set; }
		double craft_mass;
		[KSPField (guiName = "Range", guiActive = true)]
		float range = 20;

		public static float[] default_site_ranges = {
			20, 50, 100, 200, 400, 800, 1600, 2000
		};
		[KSPField] public string SiteRanges;
		public float[] site_ranges;

		public override string GetInfo ()
		{
			return "Survey Station";
		}

		public string GetPrimaryField ()
		{
			return null;
		}

		public string GetModuleTitle ()
		{
			return "EL Survey Station";
		}

		public Callback<Rect> GetDrawModulePanelCallback ()
		{
			return null;
		}

		public bool canBuild
		{
			get {
				if (vessel.situation == Vessel.Situations.LANDED
					|| vessel.situation == Vessel.Situations.SPLASHED
					|| vessel.situation == Vessel.Situations.PRELAUNCH) {
					return canOperate;
				}
				return false;
			}
		}

		public bool capture
		{
			get {
				return false;
			}
		}

		public ELBuildControl control
		{
			get;
			private set;
		}

		public new Vessel vessel
		{
			get {
				return base.vessel;
			}
		}

		public new Part part
		{
			get {
				return base.part;
			}
		}

		public string Name
		{
			get {
				return StationName;
			}
			set {
				StationName = value;
			}
		}

		public string LandedAt
		{
			get {
				if (site != null) {
					return site.SiteName;
				}
				return "";
			}
		}
		public string LaunchedFrom
		{
			get {
				if (site != null) {
					return site.SiteName;
				}
				return "";
			}
		}

		public uint ID { get { return part.flightID; } }

		public bool isBusy
		{
			get {
				return control.state > ELBuildControl.State.Planning;
			}
		}

		public bool canOperate
		{
			get { return Operational; }
			set {
				Operational = value;
				DetermineRange ();
			}
		}

		internal void SetSite (SurveySite selected_site)
		{
			if (site == selected_site) {
				if (site != null && virtualPad != null) {
					// update display
					virtualPad.SetSite (site);
					control.PlaceCraftHull ();
				}
				return;
			}
			Highlight (false);
			site = selected_site;
			if (site == null) {
				if (virtualPad != null) {
					Destroy (virtualPad.gameObject);
					virtualPad = null;
				}
			} else {
				if (virtualPad == null) {
					//virtualPad = EL_VirtualPad.Create (site);
				} else {
					virtualPad.SetSite (site);
				}
			}
			control.PlaceCraftHull ();
			// The build window will take care of turning on highlighting
		}

		public void Highlight (bool on)
		{
			if (on) {
				part.SetHighlightColor (XKCDColors.LightSeaGreen);
				part.SetHighlight (true, false);
			} else {
				part.SetHighlightDefault ();
			}
			if (site != null) {
				foreach (var stake in site) {
					if (stake.stake != null) {
						stake.stake.Highlight (on);
					}
				}
			}
		}

		public void SetCraftMass (double mass)
		{
			craft_mass = mass;
		}

		public float GetModuleMass (float defaultMass, ModifierStagingSituation sit)
		{
			return (float) craft_mass;
		}

		public ModifierChangeWhen GetModuleMassChangeWhen ()
		{
			return ModifierChangeWhen.CONSTANTLY;
		}

		public void SetShipTransform (Transform shipTransform, Part rootPart)
		{
		}

		Quaternion relativeRotaion;
		Vector3 relativePosition;

		public Transform PlaceShip (Transform shipTransform, Box vessel_bounds)
		{
			if (site == null) {
				return part.transform;
			}
			Transform xform;
			xform = part.FindModelTransform ("EL launch pos");

			if (xform == null) {
				GameObject launchPos = new GameObject ("EL launch pos");
				xform = launchPos.transform;
				Transform t = part.partTransform.Find("model");
				xform.SetParent (t, false);
			}
			var points = new Points (site);
			xform.transform.position = points.center;
			xform.transform.rotation = points.GetOrientation ();
			Debug.Log ($"[EL SurveyStation] launchPos {xform.position} {xform.rotation}");

			Vector3 shift = shipTransform.position;
			shift += points.ShiftBounds (xform, shift, vessel_bounds);

			relativeRotaion = shipTransform.rotation;
			relativePosition = shift;

			Quaternion rot = xform.rotation * relativeRotaion;
			Vector3 pos = xform.TransformPoint (relativePosition);
			shipTransform.rotation = rot;
			shipTransform.position = pos;
			return xform;
		}

		public void RepositionShip (Vessel ship)
		{
			Transform xform;
			xform = part.FindModelTransform ("EL launch pos");
			Quaternion rot = xform.rotation * relativeRotaion;
			Vector3 pos = xform.TransformPoint (relativePosition);
			ship.SetRotation (rot, false);
			ship.SetPosition (pos, true);
		}

		public void PostBuild (Vessel craftVessel)
		{
			var brakes = craftVessel.FindPartModulesImplementing<ModuleWheelBrakes> ();
			for (int i = brakes.Count; i-- > 0; ) {
				brakes[i].brakeInput = 1;
			}
			if (brakes.Count > 0) {
				var group = KSPActionGroup.Brakes;
				var actionGroups = craftVessel.ActionGroups;
				actionGroups.SetGroup (group, true);
			}
		}

		public override void OnSave (ConfigNode node)
		{
			control.Save (node);
		}

		public override void OnLoad (ConfigNode node)
		{
			if (HighLogic.LoadedScene == GameScenes.FLIGHT) {
				Debug.Log (String.Format ("[EL SurveyStation] {0} cap: {1} seats: {2}",
						  part, part.CrewCapacity,
						  part.FindModulesImplementing<KerbalSeat> ().Count));
			}
			control.Load (node);
		}

		public override void OnAwake ()
		{
			control = new ELBuildControl (this);

			site_ranges = new float[default_site_ranges.Length];
			Array.Copy (default_site_ranges, site_ranges, site_ranges.Length);
		}

		public override void OnStart (PartModule.StartState state)
		{
			if (state == PartModule.StartState.None
				|| state == PartModule.StartState.Editor) {
				return;
			}

			if (!String.IsNullOrEmpty (SiteRanges)) {
				string[] ranges = ParseExtensions.ParseArray (SiteRanges);
				if (ranges != null) {
					for (int i = 0; i < ranges.Length && i < site_ranges.Length; i++) {
						float v;
						if (!float.TryParse (ranges[i], out v)) {
							Debug.Log ($"[EL SurveyStation] error parsing site ranges: {ranges[i]}");
							break;
						}
						if (v <= 0) {
							// treat as default
							continue;
						}
						site_ranges[i] = v;
					}
				}
			}
			//for (int i = 0; i < site_ranges.Length; i++) {
			//	Debug.Log ($"[EL SurveyStation] site_ranges[{i}]: {site_ranges[i]}");
			//}
			control.OnStart ();
			if (EVARange > 0) {
				EL_Utils.SetupEVAEvent (Events["ShowRenameUI"], EVARange);
			}
			GameEvents.onVesselSituationChange.Add (onVesselSituationChange);
			GameEvents.onCrewTransferred.Add (onCrewTransferred);
			StartCoroutine (WaitAndDetermineRange ());
			ELSurveyTracker.onSiteAdded.Add (onSiteAdded);
			ELSurveyTracker.onSiteRemoved.Add (onSiteRemoved);
			ELSurveyTracker.onSiteModified.Add (onSiteModified);
			ELSurveyTracker.onStakeModified.Add (onStakeModified);
			UpdateMenus (false);
		}

		void OnDestroy ()
		{
			if (control != null) {
				control.OnDestroy ();
				GameEvents.onVesselSituationChange.Remove (onVesselSituationChange);
				GameEvents.onCrewTransferred.Remove (onCrewTransferred);
				ELSurveyTracker.onSiteAdded.Remove (onSiteAdded);
				ELSurveyTracker.onSiteRemoved.Remove (onSiteRemoved);
				ELSurveyTracker.onSiteModified.Remove (onSiteModified);
				ELSurveyTracker.onStakeModified.Remove (onStakeModified);
			}
		}

		//[KSPEvent (guiActive = true, guiName = "Hide UI", active = false)]
		//public void HideUI ()
		//{
		//	ELWindowManager.HideBuildWindow ();
		//}

		//[KSPEvent (guiActive = true, guiName = "Show UI", active = false)]
		//public void ShowUI ()
		//{
		//	ELWindowManager.ShowBuildWindow (control);
		//}

		//[KSPEvent (guiActive = true, guiActiveEditor = true,
		//		   guiName = "Rename", active = true)]
		//public void ShowRenameUI ()
		//{
		//	oldName = StationName;
		//	ELRenameDialog.OpenDialog (ELLocalization.RenameSurveyStation, this);
		//}

		public void UpdateMenus (bool visible)
		{
			Events["HideUI"].active = visible;
			Events["ShowUI"].active = !visible;
		}

		void FindSites ()
		{
			available_sites = ELSurveyTracker.instance.FindSites (vessel, range);
			if (available_sites == null || available_sites.Count < 1) {
				Highlight (false);
				SetSite (null);
			} else {
				var slist = new List<string> ();
				for (int ind = 0; ind < available_sites.Count; ind++) {
					slist.Add (available_sites[ind].SiteName);
				}
				if (!available_sites.Contains (site)) {
					Highlight (false);
					SetSite (available_sites[0]);
				}
			}
		}

		IEnumerator WaitAndFindSites ()
		{
			while (!FlightGlobals.ready) {
				yield return null;
			}
			for (int i = 0; i < 10; i++) {
				yield return null;
			}
			FindSites ();
		}

		IEnumerator WaitAndDetermineRange ()
		{
			yield return null;
			DetermineRange ();
		}

		void DetermineRange ()
		{
			var crewList = EL_Utils.GetCrewList (part);
			int bestLevel = -2;
			foreach (var crew in crewList) {
				int level = -1;
				if (crew.GetEffect<ELSurveySkill> () != null) {
					level = crew.experienceLevel;
				}
				if (level > bestLevel) {
					bestLevel = level;
				}
				Debug.LogFormat ("[EL SurveyStation] Kerbal: {0} {1} {2} {3}",
								 crew.name,
								 crew.GetEffect<ELSurveySkill> () != null,
								 crew.experienceLevel, level);
			}
			if (bestLevel > 5) {
				bestLevel = 5;
			}
			range = site_ranges[bestLevel + 2];
			Debug.LogFormat ("[EL SurveyStation] best level: {0}, range: {1}",
							 bestLevel, range);
			if (canBuild) {
				StartCoroutine (WaitAndFindSites ());
			}
		}

		private void onVesselSituationChange (GameEvents.HostedFromToAction<Vessel, Vessel.Situations> vs)
		{
			if (vs.host != vessel) {
				return;
			}
			DetermineRange ();
		}

		void onCrewTransferred (GameEvents.HostedFromToAction<ProtoCrewMember,Part> hft)
		{
			if (hft.from != part && hft.to != part) {
				return;
			}
			Debug.LogFormat ("[EL SurveyStation] transfer: {0} {1} {2}",
							 hft.host, hft.from, hft.to);
			StartCoroutine (WaitAndDetermineRange ());
		}

		void onSiteAdded (SurveySite s)
		{
			Debug.LogFormat ("[ELSurveyStation] onSiteAdded");
			FindSites ();
			SetSite (site);
		}

		void onSiteRemoved (SurveySite s)
		{
			Debug.LogFormat ("[ELSurveyStation] onSiteRemoved");
			if (s == site) {
				site = null;
			}
			FindSites ();
		}

		void onSiteModified (SurveySite s)
		{
			Debug.LogFormat ("[ELSurveyStation] onSiteModified");
			FindSites ();
			SetSite (site);
			control.PlaceCraftHull ();
		}

		void onStakeModified (ELSurveyStake s)
		{
			Debug.LogFormat ("[ELSurveyStation] onStakeModified");
			if (site != null && site.Contains (s.vessel)) {
				control.PlaceCraftHull ();
			}
		}

		public void DoWork (double kerbalHours)
		{
			control.DoWork (kerbalHours);
		}

		public bool isActive
		{
			get {
				return control.isActive;
			}
		}

		public ELVesselWorkNet workNet
		{
			get {
				return control.workNet;
			}
			set {
				control.workNet = value;
			}
		}

		public bool ready { get { return control.ready; } }

		public double CalculateWork ()
		{
			return control.CalculateWork();
		}

		public void OnRename ()
		{
			control.OnRename (oldName);
		}
	}
}
