"""NBL-Intelligence - AI-native water intelligence platform for Nature Based Living (NBL) sites.

The platform reasons with NVIDIA-hosted language models, but every number it
reports comes from one of the two calculation engines:

* NBL-AquaTwin  - groundwater exploration, 3D model, recharge, MODFLOW scenarios
* NBL-WaterPlan - water balance, demand build-up, storage, closed loop

The engines stay separate programs. NBL-Intelligence reads their results and
calls them; it never copies their formulas.
"""

APP_NAME = "NBL-Intelligence"
__version__ = "1.2.5"
