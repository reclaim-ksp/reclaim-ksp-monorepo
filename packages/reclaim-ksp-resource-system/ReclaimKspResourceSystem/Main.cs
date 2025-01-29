using System;
using System.Collections.Generic;
using UnityEngine;

namespace ReclaimKspResourceSystem
{
    [KSPAddon(KSPAddon.Startup.Flight, false)]
    internal class Main : MonoBehaviour
    {
        public void Update()
        {
            bool key = Input.GetKey(KeyCode.LeftShift) && Input.GetKeyDown(KeyCode.Alpha1);
            if (key)
            {
                List<Part> parts = FlightGlobals.ActiveVessel.parts;
                int index;
                System.Random rnd = new System.Random();
                index = rnd.Next(1, parts.Count); // // we ignore the root part by starting at 1
                parts[index].explode();
            }
        }
    }
}
